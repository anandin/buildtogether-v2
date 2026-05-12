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
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { plaidTransactions, expenses, userPreferences } from "../../shared/schema";
import {
  getUserTimezone,
  localWeekStartIso,
  localDayOfWeekIndex,
  localDaysAgoIso,
  localDateString,
} from "./user-tz";
import { getMonthlyIncome } from "./income-summary";

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
  /** Horizon block — income line + verdict + score, computed for month
   * and year ranges (week's income horizon would be a pro-rated fudge,
   * so we leave it null there). Drives the BTSpend "sky + categories
   * hanging from the line" layout. */
  horizon?: SpendHorizon;
};

/** Verdict tone — maps to theme color slots on the client. The client
 * has the actual hex values; the server just labels the bucket. */
export type SpendVerdictTone = "good" | "ok" | "warn" | "edge" | "bad";

export type SpendVerdict = {
  label: "Soaring" | "Steady" | "Tight" | "Edge" | "Underwater";
  tone: SpendVerdictTone;
  /** 0-10. Soaring 7-10, Steady 6-9, Tight 4-7, Edge 3, Underwater 0-2. */
  score: number;
  /** One-line weather summary at the top of the panel. */
  weatherLabel: string;
  /** One-line Tilly observation under the score / comparator. */
  closingLine: string;
};

export type HorizonMonth = {
  /** Single-letter label J F M A M J ... */
  m: string;
  income: number;
  spend: number;
  /** True for months past today — rendered dimmed, no data. */
  isFuture: boolean;
};

export type SpendHorizon = {
  /** Take-home income for the range (month income, or YTD income). */
  income: number;
  /** Total spend for the range — discretionary + fixed obligations. */
  totalSpent: number;
  /** income - totalSpent. Negative = underwater. */
  surplus: number;
  /** Signed percentage. -8 means spent 108% of income. */
  savingsRate: number;
  verdict: SpendVerdict;
  /** Trailing-6-month average savings rate. Only computed for month
   * range — year range already has its own historical view. */
  sixMonthAvgSavingsRate?: number;
  /** 12 entries, oldest → newest, with the current month last. Only
   * computed for year range. */
  monthlyHistory?: HorizonMonth[];
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
export type SpendRange = "week" | "month" | "year";

/** Window + bar bucketing config per range. Bar labels are short
 * (single-char where possible) so the existing 7-bar layout adapts to
 * 4-week and 12-month layouts without redesign. */
function rangeConfig(range: SpendRange, now: Date, tz: string): {
  startIso: string;
  bucketCount: number;
  labels: string[];
  bucketIndexFor: (dateIso: string) => number; // 0 = leftmost (oldest), bucketCount-1 = rightmost (today)
  todayBucketIdx: number;
  rangeLabel: string;
} {
  const todayIso = localDateString(now, tz);
  const todayTime = new Date(todayIso + "T12:00:00Z").getTime();
  if (range === "week") {
    const startIso = localWeekStartIso(now, tz);
    return {
      startIso,
      bucketCount: 7,
      labels: DAY_LETTERS,
      bucketIndexFor: (d: string) => dayOfWeekIndex(d),
      todayBucketIdx: localDayOfWeekIndex(now, tz),
      rangeLabel: "this week",
    };
  }
  if (range === "month") {
    // Rolling 28 days, bucketed into 4 weekly bars. The rightmost bar
    // is "this week (so far)". The leftmost is "4 weeks ago".
    const startIso = localDaysAgoIso(now, tz, 27);
    return {
      startIso,
      bucketCount: 4,
      labels: ["4w", "3w", "2w", "now"],
      bucketIndexFor: (d: string) => {
        const t = new Date(d + "T12:00:00Z").getTime();
        const daysAgo = Math.floor((todayTime - t) / (24 * 3600 * 1000));
        const weeksAgo = Math.floor(daysAgo / 7);
        return 3 - Math.min(3, Math.max(0, weeksAgo));
      },
      todayBucketIdx: 3,
      rangeLabel: "this month",
    };
  }
  // year: 12 monthly bars (rolling). Bucket by month-difference.
  const startIso = localDaysAgoIso(now, tz, 364);
  const [y0, m0] = todayIso.split("-").map((n) => parseInt(n, 10));
  const monthLabel = (idx: number) => {
    // idx=0 → 11 months ago, idx=11 → current month
    const offset = 11 - idx;
    const ref = new Date(Date.UTC(y0, m0 - 1 - offset, 1));
    return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][ref.getUTCMonth()];
  };
  return {
    startIso,
    bucketCount: 12,
    labels: Array.from({ length: 12 }, (_, i) => monthLabel(i)),
    bucketIndexFor: (d: string) => {
      const [y, m] = d.split("-").map((n) => parseInt(n, 10));
      const monthsAgo = (y0 - y) * 12 + (m0 - m);
      return 11 - Math.min(11, Math.max(0, monthsAgo));
    },
    todayBucketIdx: 11,
    rangeLabel: "this year",
  };
}

export async function buildWeeklyPattern(
  householdId: string,
  userId: string | null = null,
  range: SpendRange = "week",
): Promise<WeeklyPattern | null> {
  const now = new Date();
  const tz = await getUserTimezone(userId);
  // Month / year ranges have simpler shapes (no soft-spot detection,
  // no rolling-7 fallback) — delegate to a dedicated builder so the
  // week path stays intact and well-tested.
  if (range !== "week") {
    return buildMonthOrYearPattern(householdId, userId, range, now, tz);
  }
  // === Week (existing logic below) ===
  // Resolve the user's timezone once. Vercel runs UTC; computing
  // weekStart from `new Date()` flips the week 4-5h early for an
  // East-Coast user (Sunday 9pm Toronto = Monday 1am UTC → "$0 this
  // week"). Use the user's city → IANA tz instead.
  const weekStartIso = localWeekStartIso(now, tz);
  const todayIdx = localDayOfWeekIndex(now, tz);
  // For the 8-week trailing window for soft-spot baselines we just need
  // a safe lower bound — using 9 weeks back from the local week start
  // never undercuts.
  const eightWeeksAgoIso = localDaysAgoIso(now, tz, 9 * 7);

  const txRows = await readAllTransactions(householdId, eightWeeksAgoIso);

  if (txRows.length === 0) return null;

  // ─── Discretionary vs fixed-obligation split ─────────────────────────────
  // Single source of truth for what counts as "spending" vs "money flow".
  // The headline, bars, soft-spots, and primary categories list ALL use
  // discretionaryThisWeek so they're internally consistent. fixedThisWeek
  // surfaces the same buckets as their own section in the response.
  let thisWeekTx = txRows.filter((t) => t.date >= weekStartIso);
  const fixedCats = await resolveFixedObligationSet(userId);
  const isFixed = (t: UnifiedTx) =>
    fixedCats.has((t.category || "").toLowerCase());
  // Rolling-7-day fallback: if the user has zero discretionary
  // activity this week (Monday-to-now in their TZ) but plenty of
  // activity over the last 7 rolling days, surface the rolling window
  // instead of a $0 page. Avoids the "Spend looks broken on Sunday
  // night" problem and the "first day of the week" empty state more
  // generally. Marks the response with `rolling7Days: true` so the
  // mobile can label the bars correctly ("Last 7 days" instead of
  // "This week's pattern").
  let usingRolling7 = false;
  let bucketLabel: "this_week" | "last_7_days" = "this_week";
  const discretionaryThisWeekRaw = thisWeekTx.filter((t) => !isFixed(t));
  if (discretionaryThisWeekRaw.length === 0) {
    const sevenDaysAgoIso = localDaysAgoIso(now, tz, 6);
    const rolling = txRows.filter((t) => t.date >= sevenDaysAgoIso);
    if (rolling.filter((t) => !isFixed(t)).length > 0) {
      thisWeekTx = rolling;
      usingRolling7 = true;
      bucketLabel = "last_7_days";
    }
  }
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
  // Headline copy reflects the window — if we fell back to last 7
  // rolling days because "this week" was empty, call that out so the
  // user understands why Sunday-evening Spend isn't $0 fresh.
  const windowSuffix = usingRolling7 ? " (last 7 days)" : "";
  if (top) {
    italicSpan = FULL_DAY_NAMES[top.dayIdx];
    headline = `$${Math.round(totalSpent)} spent${windowSuffix}. ${italicSpan} are still your soft spot.`;
  } else {
    headline = `$${Math.round(totalSpent)} spent${windowSuffix}. No surprises this week.`;
  }

  // ─── Today mini-ledger: top 3 today ────────────────────────────────────
  // Dedupe by (merchant, amount) so a Plaid sandbox dataset that
  // repeats "United Airlines $500" three times shows once, leaving room
  // for the student's own manual logs (Popeyes, coffee, etc.).
  // todayIso for "transactions that landed today" — must be the user's
  // local date, not UTC. On Sunday 9pm Toronto the UTC date is already
  // Monday, so a UTC-derived todayIso would miss all of Sunday's tx.
  const todayIso = localDateString(now, tz);
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

/**
 * Month/year range builder. Simpler than the week path — no
 * soft-spot detection, no rolling-7 fallback, no today mini-ledger.
 * Bars are bucketed via rangeConfig.bucketIndexFor (weekly for month,
 * monthly for year). Categories rank over the full range total.
 */
async function buildMonthOrYearPattern(
  householdId: string,
  userId: string | null,
  range: SpendRange,
  now: Date,
  tz: string,
): Promise<WeeklyPattern | null> {
  const cfg = rangeConfig(range, now, tz);
  const txRows = await readAllTransactions(householdId, cfg.startIso);
  if (txRows.length === 0) return null;

  const fixedCats = await resolveFixedObligationSet(userId);
  const isFixed = (t: UnifiedTx) =>
    fixedCats.has((t.category || "").toLowerCase());
  const discretionary = txRows.filter((t) => !isFixed(t));
  const fixedRows = txRows.filter(isFixed);

  // Bars bucketed via rangeConfig
  const bucketTotals = new Array(cfg.bucketCount).fill(0);
  for (const t of discretionary) {
    const idx = cfg.bucketIndexFor(t.date);
    if (idx < 0 || idx >= cfg.bucketCount) continue;
    bucketTotals[idx] += t.amount;
  }
  const bars: DayBar[] = bucketTotals.map((amt, i) => ({
    d: cfg.labels[i] ?? "",
    amt: Math.round(amt),
    soft: false,
    today: i === cfg.todayBucketIdx,
  }));

  // Categories — top 8 by total over range. Same shape as week.
  const totals = new Map<string, number>();
  const buckets = new Map<string, UnifiedTx[]>();
  for (const t of discretionary) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    const arr = buckets.get(t.category) ?? [];
    arr.push(t);
    buckets.set(t.category, arr);
  }
  const topCats = [...totals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);
  const categories: SpendCategory[] = topCats.map(([name, amt], catIdx) => {
    const rawTxs = buckets.get(name) ?? [];
    const seenKeys = new Set<string>();
    const txList: SpendTx[] = [];
    for (const t of rawTxs) {
      const label = (t.who || name).trim();
      const key = `${label.toLowerCase()}::${t.amount}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      txList.push({
        id: `cat-${catIdx}-tx-${txList.length}`,
        name: label,
        date: t.date,
        amt: t.amount,
      });
    }
    return {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      hue: categoryHue(name),
      context: contextFor(null, txList),
      amt: Math.round(amt),
      transactions: txList.slice(0, 50),
    };
  });

  // Fixed obligations same shape, no top-N slice — show everything.
  const fixedTotals = new Map<string, number>();
  const fixedBuckets = new Map<string, UnifiedTx[]>();
  for (const t of fixedRows) {
    fixedTotals.set(t.category, (fixedTotals.get(t.category) ?? 0) + t.amount);
    const arr = fixedBuckets.get(t.category) ?? [];
    arr.push(t);
    fixedBuckets.set(t.category, arr);
  }
  const fixedObligations: SpendCategory[] = [...fixedTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, amt], catIdx) => {
      const rawTxs = fixedBuckets.get(name) ?? [];
      const seenKeys = new Set<string>();
      const txList: SpendTx[] = [];
      for (const t of rawTxs) {
        const label = (t.who || name).trim();
        const key = `${label.toLowerCase()}::${t.amount}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        txList.push({
          id: `fixed-${catIdx}-tx-${txList.length}`,
          name: label,
          date: t.date,
          amt: t.amount,
        });
      }
      return {
        id: name.toLowerCase().replace(/\s+/g, "-"),
        name,
        hue: categoryHue(name),
        context: contextFor(null, txList),
        amt: Math.round(amt),
        transactions: txList.slice(0, 50),
      };
    });

  const totalDiscretionary = discretionary.reduce((s, t) => s + t.amount, 0);
  const totalFixed = fixedRows.reduce((s, t) => s + t.amount, 0);
  // For Horizon, the bars hanging from the income line represent ALL
  // outflow — loans + subs + groceries + everything. The discretionary
  // vs fixed split lives in the category list below the panel, but the
  // line-broke-or-it-didn't math has to use the full picture.
  const totalSpent = totalDiscretionary + totalFixed;

  // Headline copy keeps using discretionary so the spend headline stays
  // consistent with the old behaviour and with the week-range path.
  const headline =
    range === "month"
      ? `$${Math.round(totalDiscretionary).toLocaleString()} spent this month.`
      : `$${Math.round(totalDiscretionary).toLocaleString()} spent this year.`;

  const horizon = await buildHorizon({
    userId,
    householdId,
    range,
    now,
    tz,
    totalSpent,
    topCategoryName: topCats[0]?.[0],
    topCategoryAmt: topCats[0]?.[1] ?? 0,
  });

  return {
    ready: true,
    spent: Math.round(totalDiscretionary),
    headline,
    bars,
    categories,
    fixedObligations,
    today: [],
    horizon,
  } as WeeklyPattern;
}

/**
 * Map a signed savings rate (%) to a verdict bucket + theme tone + 0-10
 * score + one-line weather label + closing-line tilly observation.
 *
 * Thresholds match the Tilly Horizon design spec:
 *   >= 25%  → Soaring
 *   >= 15%  → Steady
 *   >=  5%  → Tight
 *   >=  0%  → Edge
 *   <   0%  → Underwater
 *
 * The closing line is generic when we don't have anything specific —
 * the caller passes `topCategoryName` so we can drop a "Loans drank
 * deepest" style line when there's a clear lead.
 */
function bucketVerdict(
  savingsRate: number,
  topCategoryName: string | undefined,
  range: SpendRange,
): SpendVerdict {
  const topCat = topCategoryName ? topCategoryName : null;
  const rangeWord = range === "year" ? "this year" : "this month";
  if (savingsRate >= 25) {
    return {
      label: "Soaring",
      tone: "good",
      score: Math.min(10, 7 + Math.round((savingsRate - 25) / 5)),
      weatherLabel: "Clear skies. Well above the line.",
      closingLine: `Strong ${rangeWord}. The line held with room to spare.`,
    };
  }
  if (savingsRate >= 15) {
    return {
      label: "Steady",
      tone: "ok",
      score: Math.min(9, 6 + Math.round((savingsRate - 15) / 5)),
      weatherLabel: "Healthy breathing room.",
      closingLine: topCat
        ? `${capitalize(topCat)} drank the deepest. Everything else stayed in range.`
        : `Comfortably under the line ${rangeWord}.`,
    };
  }
  if (savingsRate >= 5) {
    return {
      label: "Tight",
      tone: "warn",
      score: Math.min(7, 4 + Math.round((savingsRate - 5) / 5)),
      weatherLabel: "Getting close to the line.",
      closingLine: topCat
        ? `Close call. ${capitalize(topCat)} ran hottest.`
        : `Close call ${rangeWord}. Most categories ran hotter than usual.`,
    };
  }
  if (savingsRate >= 0) {
    return {
      label: "Edge",
      tone: "edge",
      score: 3,
      weatherLabel: "Living right at the line.",
      closingLine: `Touched the line ${rangeWord}. One slip and you're under.`,
    };
  }
  return {
    label: "Underwater",
    tone: "bad",
    score: Math.max(0, 2 + Math.round(savingsRate / 5)),
    weatherLabel: "You spent more than you earned.",
    closingLine: topCat
      ? `The line broke ${rangeWord}. ${capitalize(topCat)} pulled hardest. Worth a closer look together?`
      : `The line broke ${rangeWord}. Worth a closer look together?`,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the Horizon block. For month range, queries the prior 6 months
 * to compute an avg savings rate. For year, queries each of the past 12
 * months to populate monthlyHistory. Both reuse getMonthlyIncome
 * semantics by querying plaid_transactions directly with ourCategory =
 * 'income' (cheaper than calling getMonthlyIncome 12× since we already
 * have the household scoped).
 */
async function buildHorizon(args: {
  userId: string | null;
  householdId: string;
  range: SpendRange;
  now: Date;
  tz: string;
  totalSpent: number;
  topCategoryName: string | undefined;
  topCategoryAmt: number;
}): Promise<SpendHorizon | undefined> {
  const { userId, householdId, range, now, tz, totalSpent, topCategoryName } = args;
  if (range !== "month" && range !== "year") return undefined;

  // For month: income = current month take-home (or estimate / self-report fallback).
  // For year: income = sum of every paycheck since Jan 1 of the local year.
  let income: number;
  if (range === "month") {
    const mi = await getMonthlyIncome(userId, householdId, now);
    income = mi.amount;
  } else {
    const yearStartIso = `${localDateString(now, tz).slice(0, 4)}-01-01`;
    const todayIso = localDateString(now, tz);
    const ytdIncomeRows = await db
      .select({ amount: plaidTransactions.amount })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.ourCategory, "income"),
          gte(plaidTransactions.date, yearStartIso),
          lte(plaidTransactions.date, todayIso),
        ),
      );
    income = ytdIncomeRows.reduce((s, r) => s + Math.abs(r.amount), 0);
  }

  const surplus = income - totalSpent;
  // savingsRate is signed: negative when underwater. Zero income →
  // surface 0% (avoids /0) — verdict will fall through to Edge/Underwater
  // based on signed surplus anyway.
  const savingsRate = income > 0 ? (surplus / income) * 100 : 0;
  const verdict = bucketVerdict(savingsRate, topCategoryName, range);

  let sixMonthAvgSavingsRate: number | undefined;
  let monthlyHistory: HorizonMonth[] | undefined;

  if (range === "month") {
    sixMonthAvgSavingsRate = await computeTrailingAvgSavingsRate(
      householdId,
      now,
      tz,
      6,
    );
  } else {
    monthlyHistory = await computeMonthlyHistory(householdId, now, tz);
  }

  return {
    income: Math.round(income),
    totalSpent: Math.round(totalSpent),
    surplus: Math.round(surplus),
    savingsRate: Math.round(savingsRate * 10) / 10,
    verdict,
    sixMonthAvgSavingsRate:
      sixMonthAvgSavingsRate !== undefined
        ? Math.round(sixMonthAvgSavingsRate * 10) / 10
        : undefined,
    monthlyHistory,
  };
}

/** Compute mean savings rate (%) over the prior N complete months,
 * excluding the current in-progress month. Returns undefined if we
 * can't get at least 2 months of history. */
async function computeTrailingAvgSavingsRate(
  householdId: string,
  now: Date,
  tz: string,
  monthCount: number,
): Promise<number | undefined> {
  const months = priorMonthBounds(now, tz, monthCount);
  const rates: number[] = [];
  for (const { startIso, endIso } of months) {
    const [incomeRows, spendRows] = await Promise.all([
      db
        .select({ amount: plaidTransactions.amount })
        .from(plaidTransactions)
        .where(
          and(
            eq(plaidTransactions.coupleId, householdId),
            eq(plaidTransactions.ourCategory, "income"),
            gte(plaidTransactions.date, startIso),
            lte(plaidTransactions.date, endIso),
          ),
        ),
      db
        .select({ amount: plaidTransactions.amount, ourCategory: plaidTransactions.ourCategory })
        .from(plaidTransactions)
        .where(
          and(
            eq(plaidTransactions.coupleId, householdId),
            gte(plaidTransactions.date, startIso),
            lte(plaidTransactions.date, endIso),
          ),
        ),
    ]);
    const income = incomeRows.reduce((s, r) => s + Math.abs(r.amount), 0);
    // Spend = everything except income. Don't strip transfers — when we
    // do that for the headline, it's to exclude move-between-own-accounts;
    // here we want the whole outflow picture against income.
    const spend = spendRows
      .filter((r) => (r.ourCategory ?? "").toLowerCase() !== "income")
      .reduce((s, r) => s + Math.abs(r.amount), 0);
    if (income > 0) {
      rates.push(((income - spend) / income) * 100);
    }
  }
  if (rates.length < 2) return undefined;
  return rates.reduce((s, v) => s + v, 0) / rates.length;
}

/** Build a 12-entry monthly history for the local year. The first
 * entries are the earliest months (Jan), the last is the current
 * month. Months past the current one are marked isFuture so the
 * client can render them dimmed without an income line. */
async function computeMonthlyHistory(
  householdId: string,
  now: Date,
  tz: string,
): Promise<HorizonMonth[]> {
  const todayIso = localDateString(now, tz);
  const [yearStr, currMonStr] = todayIso.split("-");
  const year = parseInt(yearStr, 10);
  const currMonth = parseInt(currMonStr, 10); // 1-12
  const letters = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  // Build all 12 month ranges up front so we can run a single SQL query.
  const monthsMeta = Array.from({ length: 12 }, (_, i) => {
    const monthNum = i + 1; // 1-12
    const startIso = `${year}-${String(monthNum).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
    const endIso = `${year}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return {
      monthNum,
      startIso,
      endIso,
      letter: letters[i],
      isFuture: monthNum > currMonth,
    };
  });

  // One scan for the whole year then bucket in memory. Cheaper than
  // 12 SQL round-trips, especially since the per-month rate helper
  // already pays that cost for the 6-month avg.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      ourCategory: plaidTransactions.ourCategory,
      date: plaidTransactions.date,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, yearStart),
        lte(plaidTransactions.date, yearEnd),
      ),
    );

  const incomeByMonth = new Array(12).fill(0);
  const spendByMonth = new Array(12).fill(0);
  for (const r of rows) {
    const m = parseInt(r.date.slice(5, 7), 10) - 1;
    if (m < 0 || m > 11) continue;
    const cat = (r.ourCategory ?? "").toLowerCase();
    const abs = Math.abs(r.amount);
    if (cat === "income") incomeByMonth[m] += abs;
    else spendByMonth[m] += abs;
  }

  return monthsMeta.map(({ letter, monthNum, isFuture }) => ({
    m: letter,
    income: isFuture ? 0 : Math.round(incomeByMonth[monthNum - 1]),
    spend: isFuture ? 0 : Math.round(spendByMonth[monthNum - 1]),
    isFuture,
  }));
}

/** Return the [startIso, endIso] bounds of the N months immediately
 * preceding the local month containing `now`. Most-recent first. */
function priorMonthBounds(
  now: Date,
  tz: string,
  count: number,
): Array<{ startIso: string; endIso: string }> {
  const today = localDateString(now, tz);
  const year = parseInt(today.slice(0, 4), 10);
  const currMonth = parseInt(today.slice(5, 7), 10); // 1-12
  const out: Array<{ startIso: string; endIso: string }> = [];
  for (let i = 1; i <= count; i++) {
    // Walk backwards from currMonth - 1, wrapping years.
    let m = currMonth - i;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const startIso = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endIso = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    out.push({ startIso, endIso });
  }
  return out;
}
