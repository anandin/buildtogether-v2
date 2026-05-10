/**
 * Weekly spend pattern + soft-spot detection — feeds BTSpend (spec §4.3).
 *
 * Soft-spot definition: a category × day-of-week combo where this week's
 * spend exceeds the 8-week mean by ≥1.5 sigma. The headline picks the
 * day with the strongest signal ("Wednesdays are still your soft spot").
 *
 * Reads from `plaid_transactions` directly (not the legacy `expenses`
 * table) so the analysis tracks real bank activity. Returns the exact
 * shape BTSpend renders: bars (M-S), categories (with softSpot flags),
 * paycheck, and the editorial headline.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { plaidTransactions, expenses, userPreferences } from "../../shared/schema";

/**
 * Unified read across Plaid + manual sources. The pattern engine doesn't
 * care whether a $5 coffee came in via Plaid sync or via the user voicing
 * "$5 coffee at stumptown" into the FAB modal — both are equally real.
 */
type UnifiedTx = {
  amount: number;
  date: string;
  category: string;
  source: "plaid" | "manual_text" | "manual_voice" | "manual_photo";
  who?: string;
  createdAt?: number;
};

async function readAllTransactions(
  householdId: string,
  sinceIso: string,
): Promise<UnifiedTx[]> {
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select()
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          // Only accepted rows count as spend. Without this filter,
          // status='ignored' (user dismissed the row), 'pending_review'
          // (still in the inbox), and 'auto_accepting' (transient race
          // window) all leaked into the Spend totals — Canada Txd was
          // appearing twice for this user (one accepted as taxes,
          // one ignored, both summed).
          eq(plaidTransactions.status, "accepted"),
          sql`${plaidTransactions.date} >= ${sinceIso}`,
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          sql`${expenses.date} >= ${sinceIso}`,
          sql`${expenses.amount} > 0`,
          // (note + tags read via expenses.* and surfaced to Tilly downstream
          // — see analyze-affordability for consumption.)
        ),
      ),
  ]);
  const out: UnifiedTx[] = [];
  // Task #23: when Plaid hasn't classified a transaction (category is empty,
  // "other", or "Uncategorized") fall back to the merchant name so chat
  // answers and weekly bars say "Starbucks $14" instead of bucketing it
  // into a faceless "other".
  const isVagueCat = (c: string) => {
    const n = c.trim().toLowerCase();
    return !n || n === "other" || n === "uncategorized";
  };
  for (const t of plaidRows) {
    const merchant = t.merchantName ?? t.name ?? undefined;
    const rawCat = (t.ourCategory || "").trim();
    const category = isVagueCat(rawCat) && merchant ? merchant : (rawCat || "Uncategorized");
    out.push({
      amount: t.amount,
      date: t.date,
      category,
      source: "plaid",
      who: merchant,
      createdAt: (t as any).createdAt
        ? new Date((t as any).createdAt as any).getTime()
        : 0,
    });
  }
  for (const e of manualRows) {
    if (e.source === "plaid") continue; // dedupe — Plaid copies use plaid source
    const merchant = e.merchant ?? e.description;
    const rawCat = (e.category || "").trim();
    const category = isVagueCat(rawCat) && merchant ? merchant : (rawCat || "other");
    out.push({
      amount: e.amount,
      date: e.date,
      category,
      source: (e.source as UnifiedTx["source"]) ?? "manual_text",
      who: merchant,
      createdAt: (e as any).createdAt
        ? new Date((e as any).createdAt as any).getTime()
        : 0,
    });
  }
  // Newest first — the Today mini-ledger slice picks the top N, and
  // students expect "what I just logged" to be on top, not "the same
  // Plaid sandbox row repeated three times".
  out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return out;
}

export type DayBar = {
  d: string; // M T W T F S S
  amt: number;
  soft?: boolean;
  today?: boolean;
};

// One line item within a category — shown when the user taps to expand.
export type SpendTx = {
  id: string;       // stable key for React
  name: string;     // best available label: merchant → description → category
  date: string;     // ISO "YYYY-MM-DD"
  amt: number;      // positive spend amount
};

export type SpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;  // e.g. "3 transactions · Spotify, Netflix"
  amt: number;
  softSpot?: boolean;
  transactions: SpendTx[];  // drill-down rows, newest first
};

export type WeeklyPattern = {
  ready: true;
  spent: number;
  headline: string;
  italicSpan?: string;
  bars: DayBar[];
  /** Top discretionary categories this week — what "spending" really means.
   * Excludes fixed-obligation buckets (loans / taxes / transfers / fees)
   * which live in `fixedObligations` below so the user can see them without
   * letting them dominate the spend headline + soft-spot detection. */
  categories: SpendCategory[];
  /** Fixed-obligation buckets this week — debt service, taxes, between-
   * own-account moves, bank fees. Same shape as categories so the mobile
   * client can reuse `CategoryRow`. Empty when the user has no such rows. */
  fixedObligations: SpendCategory[];
  today: { id: string; who: string; cat: string; amt: number; time: string }[];
  paycheck?: { amount: number; source: string; day: string; daysUntil: number };
};

/** DEFAULT categories treated as "money flow / fixed" rather than
 * discretionary spending. Excluded from headline totals + bars +
 * soft-spot detection, surfaced in the dedicated `fixedObligations`
 * field. `fees` joins the club because an annual card fee or NSF charge
 * is non-discretionary at the moment it lands; the user can't avoid it
 * this week.
 *
 * The user can OVERRIDE these defaults via the setCategoryInclusion
 * chat tool. We resolve overrides per-call via resolveFixedObligationSet
 * below. Keep the constant in sync with the registry's
 * DEFAULT_FIXED_OBLIGATION_CATS. */
const FIXED_OBLIGATION_CATS = new Set([
  "loans",
  "taxes",
  "transfers",
  "fees",
]);

/**
 * Returns the effective fixed-obligation set for this user, applying
 * `include_in_spend.<category>` overrides on top of the defaults.
 * - includeInSpend=true on a default-excluded cat (loans, taxes, etc.)
 *   removes it from the fixed set (now counts toward the headline).
 * - includeInSpend=false on a default-included cat (subscriptions,
 *   restaurants, etc.) adds it to the fixed set (now treated as
 *   money flow only).
 *
 * Reads userPreferences directly. Without a userId we just return the
 * defaults — non-user-scoped callers (cron, state-summary) shouldn't
 * apply per-user overrides.
 */
async function resolveFixedObligationSet(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set(FIXED_OBLIGATION_CATS);
  const rows = await db
    .select()
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.scope, "spend"),
      ),
    );
  const overrides = new Map<string, boolean>();
  for (const r of rows) {
    if (!r.key.startsWith("include_in_spend.")) continue;
    const cat = r.key.slice("include_in_spend.".length).toLowerCase();
    const v = r.value as { includeInSpend?: unknown } | null;
    if (typeof v?.includeInSpend === "boolean") overrides.set(cat, v.includeInSpend);
  }
  const set = new Set(FIXED_OBLIGATION_CATS);
  for (const [cat, includeInSpend] of overrides) {
    if (includeInSpend) set.delete(cat);     // user opted in → no longer fixed
    else set.add(cat);                       // user opted out → now fixed
  }
  return set;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const FULL_DAY_NAMES = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

function dayOfWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  // Monday=0 ... Sunday=6
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function categoryHue(name: string): SpendCategory["hue"] {
  const n = name.toLowerCase();
  if (n.includes("coffee") || n.includes("cafe")) return "accent";
  if (n.includes("food") || n.includes("restaurant") || n.includes("doordash")) return "good";
  if (n.includes("groceries")) return "accent2";
  if (n.includes("school") || n.includes("textbook") || n === "education") return "warn";
  // Fixed-cost commitments (car/student/CC loans) — surface with the
  // alternate accent so they read as distinct from discretionary spend
  // and don't disappear into the inkSoft default.
  if (n === "loans" || n.includes("loan")) return "accent2";
  // Recurring small drains (account fees, NSF, ATM) — flag as warn so a
  // student who's accumulating $40/mo in TD fees actually notices.
  if (n === "fees" || n.includes("fee")) return "warn";
  // Tax & transfer rows are factual — neutral grey is right, no alarm.
  if (n === "taxes" || n === "transfers") return "inkSoft";
  // Insurance — recurring fixed cost, but unlike loans/fees it's a
  // protection the user signed up for. Treat it as neutral.
  if (n === "insurance" || n.includes("insur")) return "inkSoft";
  if (n === "transport" || n.includes("transit")) return "good";
  return "inkSoft";
}

function contextFor(
  softDayIdx: number | null,
  txs: SpendTx[],
): string {
  const count = txs.length;
  // Up to 3 unique names, deduplicated (same merchant bought twice → listed once)
  const seen = new Set<string>();
  const names: string[] = [];
  for (const t of txs) {
    const n = t.name;
    if (!seen.has(n)) { seen.add(n); names.push(n); }
    if (names.length >= 3) break;
  }
  const nameStr = names.join(", ");
  const countStr = count === 1 ? "1 transaction" : `${count} transactions`;
  const dayStr = softDayIdx !== null ? ` · ${FULL_DAY_NAMES[softDayIdx]} especially` : "";
  return nameStr ? `${countStr} · ${nameStr}${dayStr}` : `${countStr}${dayStr}`;
}

/**
 * Aggregate this week's spend per (category, dayOfWeek) and compare against
 * the trailing 8-week per-cell mean+stddev to flag soft spots.
 *
 * Returns null if no Plaid transactions exist — caller surfaces a
 * "connect a bank" state.
 */
export async function buildWeeklyPattern(
  householdId: string,
  userId: string | null = null,
): Promise<WeeklyPattern | null> {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const eightWeeksAgo = new Date(weekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 8 * 7);

  const txRows = await readAllTransactions(
    householdId,
    eightWeeksAgo.toISOString().slice(0, 10),
  );

  if (txRows.length === 0) return null;

  // ─── Discretionary vs fixed-obligation split ─────────────────────────────
  // Single source of truth for what counts as "spending" vs "money flow".
  // The headline, bars, soft-spots, and primary categories list ALL use
  // discretionaryThisWeek so they're internally consistent. fixedThisWeek
  // surfaces the same buckets as their own section in the response.
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const todayIdx = dayOfWeekIndex(now.toISOString().slice(0, 10));
  const thisWeekTx = txRows.filter((t) => t.date >= weekStartIso);
  const fixedCats = await resolveFixedObligationSet(userId);
  const isFixed = (t: UnifiedTx) =>
    fixedCats.has((t.category || "").toLowerCase());
  const discretionaryThisWeek = thisWeekTx.filter((t) => !isFixed(t));
  const fixedThisWeek = thisWeekTx.filter(isFixed);

  // ─── Bars: this week's daily discretionary totals ──────────────────────
  const dailyTotals = new Array(7).fill(0);
  for (const t of discretionaryThisWeek) {
    const di = dayOfWeekIndex(t.date);
    dailyTotals[di] += t.amount;
  }

  // ─── Soft-spot detection: category × day cells (discretionary only) ────
  // Loan auto-debits hit the same weekday every month, which made Monday
  // fire as a soft spot every time we ran. Restrict cells to discretionary
  // categories so soft-spot signals reflect actual habit drift.
  const cellAmounts = new Map<string, number[]>(); // key = "category|dayIdx"
  const olderTx = txRows.filter((t) => t.date < weekStartIso && !isFixed(t));
  for (const t of olderTx) {
    const cat = t.category;
    const di = dayOfWeekIndex(t.date);
    const key = `${cat}|${di}`;
    const arr = cellAmounts.get(key) ?? [];
    arr.push(t.amount);
    cellAmounts.set(key, arr);
  }

  // This-week per-cell totals (discretionary).
  const thisWeekCells = new Map<string, number>();
  for (const t of discretionaryThisWeek) {
    const cat = t.category;
    const di = dayOfWeekIndex(t.date);
    const key = `${cat}|${di}`;
    thisWeekCells.set(key, (thisWeekCells.get(key) ?? 0) + t.amount);
  }

  const softCells: { category: string; dayIdx: number; sigma: number }[] = [];
  for (const [key, thisAmt] of thisWeekCells.entries()) {
    const history = cellAmounts.get(key) ?? [];
    if (history.length < 3) continue; // not enough data to call it a pattern
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const variance =
      history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    const sigmas = (thisAmt - mean) / std;
    if (sigmas >= 1.5) {
      const [category, dayStr] = key.split("|");
      softCells.push({ category, dayIdx: parseInt(dayStr, 10), sigma: sigmas });
    }
  }
  softCells.sort((a, b) => b.sigma - a.sigma);

  // Mark bar days that have any soft cell.
  const softDays = new Set(softCells.map((c) => c.dayIdx));
  const bars: DayBar[] = dailyTotals.map((amt, i) => ({
    d: DAY_LETTERS[i],
    amt: Math.round(amt),
    soft: softDays.has(i),
    today: i === todayIdx,
  }));

  // ─── Categories: this week's top discretionary spends ──────────────────
  // Top-cap raised from 5 → 8 so smaller-but-real buckets (groceries,
  // restaurants, transit) show up alongside the dominant ones rather
  // than getting crowded out by a single big-dollar row. Only
  // discretionary categories live here; fixed obligations live in
  // their own list below.
  const TOP_DISCRETIONARY = 8;

  function buildCategoryList(
    source: UnifiedTx[],
    options: { applySoftSpot: boolean; idPrefix: string },
  ): SpendCategory[] {
    const totals = new Map<string, number>();
    const buckets = new Map<string, UnifiedTx[]>();
    for (const t of source) {
      const cat = t.category;
      totals.set(cat, (totals.get(cat) ?? 0) + t.amount);
      const arr = buckets.get(cat) ?? [];
      arr.push(t);
      buckets.set(cat, arr);
    }
    const sorted = [...totals.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_DISCRETIONARY);
    return sorted.map(([name, amt], catIdx) => {
      const softCell = options.applySoftSpot
        ? softCells.find((c) => c.category === name)
        : undefined;
      const softDayIdx = softCell ? softCell.dayIdx : null;
      const rawTxs = buckets.get(name) ?? [];
      const seenKeys = new Set<string>();
      const txList: SpendTx[] = [];
      for (const t of rawTxs) {
        const label = (t.who || name).trim();
        const key = `${label.toLowerCase()}::${t.amount}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        txList.push({
          id: `${options.idPrefix}-${catIdx}-tx-${txList.length}`,
          name: label,
          date: t.date,
          amt: t.amount,
        });
      }
      return {
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        hue: categoryHue(name),
        context: contextFor(softDayIdx, txList),
        amt: Math.round(amt),
        softSpot: !!softCell,
        transactions: txList,
      };
    });
  }

  const categories = buildCategoryList(discretionaryThisWeek, {
    applySoftSpot: true,
    idPrefix: "cat",
  });
  const fixedObligations = buildCategoryList(fixedThisWeek, {
    applySoftSpot: false,
    idPrefix: "fixed",
  });

  // ─── Headline: discretionary total, soft-spot annotation when present ──
  // Headline now matches the bar-chart sum — both come from
  // discretionaryThisWeek. No more "$15K spent" while the chart shows
  // $2K worth of bars.
  const totalSpent = discretionaryThisWeek.reduce((s, t) => s + t.amount, 0);
  const top = softCells[0];
  let headline: string;
  let italicSpan: string | undefined;
  if (top) {
    italicSpan = FULL_DAY_NAMES[top.dayIdx];
    headline = `$${Math.round(totalSpent)} spent. ${italicSpan} are still your soft spot.`;
  } else {
    headline = `$${Math.round(totalSpent)} spent. No surprises this week.`;
  }

  // ─── Today mini-ledger: top 3 today ────────────────────────────────────
  // Dedupe by (merchant, amount) so a Plaid sandbox dataset that
  // repeats "United Airlines $500" three times shows once, leaving room
  // for the student's own manual logs (Popeyes, coffee, etc.).
  const todayIso = now.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const todayTx = txRows
    .filter((t) => t.date === todayIso)
    .filter((t) => {
      const key = `${(t.who || t.category).toLowerCase()}::${t.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((t, i) => ({
      id: `today-${i}`,
      who: t.who || t.category,
      cat: t.category,
      amt: t.amount,
      time: "today",
    }));

  return {
    ready: true,
    spent: Math.round(totalSpent),
    headline,
    italicSpan,
    bars,
    categories,
    fixedObligations,
    today: todayTx,
  };
}
