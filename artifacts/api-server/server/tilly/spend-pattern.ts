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
  // Collapse same-day same-amount same-merchant rows. Plaid's
  // `plaid_transaction_id` unique constraint stops literal id collisions
  // but banks re-post some debits (tax instalments, govt transfers) with
  // a new id each time, so the user sees one real $4,907.92 Canada Txd
  // show up as three plaid_transactions rows. Without this dedupe, the
  // category total summed all three ($14,724) while the drill-in
  // collapsed by (label, amount) and showed one — internally
  // inconsistent UI. Dedupe at the source so every downstream consumer
  // (bars, totals, drill-in, horizon, income, soft-spots) agrees on the
  // same row set.
  const seen = new Set<string>();
  const deduped: UnifiedTx[] = [];
  for (const t of out) {
    const label = (t.who || t.category || "").trim().toLowerCase();
    const key = `${t.date}|${t.amount}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }
  return deduped;
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
  /** Human-readable label for the currently-rendered period, e.g.
   * "May 2026" / "2025". Drives the header for prev/next nav. */
  periodLabel?: string;
  /** Income sources for the period — grouped by merchant, same shape
   * as `categories` so the client can reuse CategoryRow. Drives the
   * "Where it comes from" section. Excludes rows the user has aliased
   * to transfers via markIncomeAsTransfer (they're no longer in
   * ourCategory='income'). */
  incomeSources?: SpendCategory[];
};

/** Verdict tone — maps to theme color slots on the client. The client
 * has the actual hex values; the server just labels the bucket. */
export type SpendVerdictTone = "good" | "ok" | "warn" | "edge" | "bad";

export type SpendVerdict = {
  // Reset 2026-05-15 from doom-coded labels (Soaring/Underwater) to
  // temperate ones (Roomy/Heavier). Old values kept in the union for
  // any persisted state or older client builds reading them.
  label:
    | "Roomy"
    | "Steady"
    | "Tight"
    | "On the line"
    | "Heavier"
    | "Soaring"
    | "Edge"
    | "Underwater";
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
  // Adjustments — see isAdjustment() in buildMonthOrYearPattern. They
  // belong in the "money flow" bucket on Spend (so the user can see
  // them) but get stripped from the Horizon panel + totalSpent math.
  "cashback",
  "credit_adjustment",
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
  offset: number = 0,
): Promise<WeeklyPattern | null> {
  const now = new Date();
  const tz = await getUserTimezone(userId);
  // Month / year ranges have simpler shapes (no soft-spot detection,
  // no rolling-7 fallback) — delegate to a dedicated builder so the
  // week path stays intact and well-tested.
  if (range !== "week") {
    return buildMonthOrYearPattern(householdId, userId, range, now, tz, offset);
  }
  // === Week (existing logic below, now offset-aware) ===
  // Resolve the user's timezone once. Vercel runs UTC; computing
  // weekStart from `new Date()` flips the week 4-5h early for an
  // East-Coast user (Sunday 9pm Toronto = Monday 1am UTC → "$0 this
  // week"). Use the user's city → IANA tz instead.
  //
  // offset shifts the week boundary backwards by N weeks. offset=0
  // returns the current week; offset=-1 returns last week (Mon-Sun
  // in local tz), etc. We compute weekStart for offset=0 via the
  // existing helper, then subtract 7*|offset| days. weekEnd = start+6.
  const currentWeekStartIso = localWeekStartIso(now, tz);
  const weekStartIso =
    offset === 0
      ? currentWeekStartIso
      : addDaysIso(currentWeekStartIso, offset * 7);
  const weekEndIso = addDaysIso(weekStartIso, 6);
  const isCurrentWeek = offset === 0;
  const todayIdx = isCurrentWeek ? localDayOfWeekIndex(now, tz) : -1;
  // For the 8-week trailing window for soft-spot baselines we just need
  // a safe lower bound — using 9 weeks back from the local week start
  // never undercuts. Anchor on the SELECTED week so historical weeks
  // get their own correct trailing baseline (not the current week's).
  const eightWeeksAgoIso = addDaysIso(weekStartIso, -9 * 7);

  const txRows = await readAllTransactions(householdId, eightWeeksAgoIso);

  if (txRows.length === 0) return null;

  // ─── Discretionary vs fixed-obligation split ─────────────────────────────
  // Single source of truth for what counts as "spending" vs "money flow".
  // The headline, bars, soft-spots, and primary categories list ALL use
  // discretionaryThisWeek so they're internally consistent. fixedThisWeek
  // surfaces the same buckets as their own section in the response.
  // For historical weeks we constrain to [weekStart, weekEnd]; for the
  // current week we keep the open-ended "from weekStart" to include
  // anything pending-stamped today (rare edge but worth preserving).
  let thisWeekTx = isCurrentWeek
    ? txRows.filter((t) => t.date >= weekStartIso)
    : txRows.filter((t) => t.date >= weekStartIso && t.date <= weekEndIso);
  const fixedCats = await resolveFixedObligationSet(userId);
  const isFixed = (t: UnifiedTx) =>
    fixedCats.has((t.category || "").toLowerCase());
  // Rolling-7-day fallback: only meaningful for the CURRENT week.
  // When navigating back to historical weeks, an empty week is just
  // an empty week — falling back to a rolling 7-day window would
  // show the user the wrong period entirely.
  let usingRolling7 = false;
  let bucketLabel: "this_week" | "last_7_days" = "this_week";
  if (isCurrentWeek) {
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
        // Include date in the key — readAllTransactions already
        // collapses same-day duplicates, so this key only collapses
        // when the data is truly duplicated. Without date, two real
        // Tim Hortons purchases on different days at $4.50 would
        // merge into one drill-in row.
        const key = `${t.date}::${label.toLowerCase()}::${t.amount}`;
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
  // Only meaningful for the CURRENT week. When the user has navigated
  // back to a prior week, "today" isn't inside that week — leave the
  // ledger empty so the BTSpend header doesn't show a TODAY chip with
  // no rows.
  const todayIso = localDateString(now, tz);
  const seen = new Set<string>();
  const todayTx = isCurrentWeek
    ? txRows
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
        }))
    : [];

  // Income sources + period label for the selected week. Period label
  // uses the actual week-start date so historical navigation reads as
  // "Week of May 4" rather than always saying "this week".
  const incomeSources = await buildIncomeSources(
    householdId,
    weekStartIso,
    weekEndIso,
  );
  const periodLabel = isCurrentWeek ? "This week" : weekLabel(weekStartIso);

  return {
    ready: true,
    spent: Math.round(totalSpent),
    headline,
    italicSpan,
    bars,
    categories,
    fixedObligations,
    today: todayTx,
    incomeSources,
    periodLabel,
  };
}

/** "Week of May 4" — formats a YYYY-MM-DD start-of-week to a short
 * human label for the navigation header. */
function weekLabel(weekStartIso: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const [y, m, d] = weekStartIso.split("-").map((n) => parseInt(n, 10));
  return `Week of ${months[m - 1]} ${d}, ${y}`;
}

/** Add a signed number of days to a YYYY-MM-DD string. Calendar-only,
 * no TZ math — both ends are already in user-local date form. */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
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
  offset: number = 0,
): Promise<WeeklyPattern | null> {
  // Shift the reference date by offset periods. range=month offset=-1
  // → ref is one month ago; range=year offset=-1 → one year ago.
  // We rebuild the window around this shifted reference so Horizon,
  // categories, and bars all reflect the same period.
  const refDate = offset === 0 ? now : shiftReferenceDate(now, tz, range, offset);
  const cfg = rangeMonthYearWindow(range, refDate, tz);
  const txRows = await readAllTransactions(householdId, cfg.startIso);
  // Filter to within the period upper bound too — otherwise viewing
  // last-month we'd accidentally pull in this-month's transactions.
  const inWindowTx = txRows.filter(
    (t) => t.date >= cfg.startIso && t.date <= cfg.endIso,
  );
  if (inWindowTx.length === 0) return null;

  const fixedCats = await resolveFixedObligationSet(userId);
  const isFixed = (t: UnifiedTx) =>
    fixedCats.has((t.category || "").toLowerCase());
  const discretionary = inWindowTx.filter((t) => !isFixed(t));
  const fixedRows = inWindowTx.filter(isFixed);

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
      const key = `${t.date}::${label.toLowerCase()}::${t.amount}`;
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
        const key = `${t.date}::${label.toLowerCase()}::${t.amount}`;
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
  // Adjustments — money flows that net to zero against the wallet and
  // shouldn't count toward "did the line hold?" math:
  //   - transfers: own-account moves (checking → savings, CC payments)
  //   - cashback: a partial refund of spend already counted
  //   - credit_adjustment: statement credits, returned goods, etc.
  // The user reclassifies income into these via the cash-flow page or
  // markIncomeAsTransfer chat tool; the Plaid sync handler also routes
  // matching aliases. Everything here is excluded from totalSpent AND
  // from the Horizon panel bar set. Other fixed cats (loans / taxes /
  // fees / insurance) DO count — those are real money leaving.
  const isAdjustment = (t: UnifiedTx) => {
    const c = (t.category || "").toLowerCase();
    return c === "transfers" || c === "cashback" || c === "credit_adjustment";
  };
  const fixedExclAdjustments = fixedRows.filter((t) => !isAdjustment(t));
  const totalFixed = fixedExclAdjustments.reduce((s, t) => s + t.amount, 0);
  // For Horizon, the bars hanging from the income line represent ALL
  // outflow — loans + subs + groceries + everything *except transfers*.
  const totalSpent = totalDiscretionary + totalFixed;

  // Headline copy keeps using discretionary so the spend headline stays
  // consistent with the old behaviour and with the week-range path.
  const headline =
    range === "month"
      ? `$${Math.round(totalDiscretionary).toLocaleString()} spent this month.`
      : `$${Math.round(totalDiscretionary).toLocaleString()} spent this year.`;

  // Compute income sources FIRST so Horizon can derive its income total
  // from the same row set. Single source of truth — by construction
  // `horizon.income === sum(incomeSources[].amt)`. Previously buildHorizon
  // ran its own parallel query that *should* have matched but was fragile
  // to one side adding a filter the other didn't.
  const incomeSources = await buildIncomeSources(
    householdId,
    cfg.startIso,
    cfg.endIso,
  );
  const horizon = await buildHorizon({
    userId,
    householdId,
    range,
    now: refDate,
    tz,
    totalSpent,
    topCategoryName: topCats[0]?.[0],
    topCategoryAmt: topCats[0]?.[1] ?? 0,
    windowStartIso: cfg.startIso,
    windowEndIso: cfg.endIso,
    incomeSources,
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
    periodLabel: cfg.periodLabel,
    incomeSources,
  } as WeeklyPattern;
}

/**
 * Compute a reference date shifted by `offset` periods from `now`.
 * For month range, offset=-1 means "one month ago" (same day-of-month
 * clamped to the new month's length). For year range, offset=-1 means
 * "one year ago" (same month + day clamped).
 *
 * Returns a Date in UTC noon for the local-tz-shifted reference day,
 * so downstream localDateString / monthStart computations land in the
 * expected month/year.
 */
function shiftReferenceDate(
  now: Date,
  tz: string,
  range: SpendRange,
  offset: number,
): Date {
  if (offset === 0) return now;
  const todayIso = localDateString(now, tz);
  const [y, m, d] = todayIso.split("-").map((n) => parseInt(n, 10));
  let newY = y;
  let newM = m;
  if (range === "month") {
    newM = m + offset;
    while (newM < 1) {
      newM += 12;
      newY -= 1;
    }
    while (newM > 12) {
      newM -= 12;
      newY += 1;
    }
  } else if (range === "year") {
    newY = y + offset;
  }
  // Clamp day to the target month's length (e.g., Mar 31 → Feb 28).
  const lastDay = new Date(Date.UTC(newY, newM, 0)).getUTCDate();
  const newD = Math.min(d, lastDay);
  return new Date(`${newY}-${String(newM).padStart(2, "0")}-${String(newD).padStart(2, "0")}T12:00:00Z`);
}

/**
 * Return the window bounds for a month/year period given a reference
 * date inside it, plus a single-letter label set for the bars and a
 * human-readable period label ("April 2026" / "2025").
 */
function rangeMonthYearWindow(
  range: SpendRange,
  refDate: Date,
  tz: string,
): {
  startIso: string;
  endIso: string;
  bucketCount: number;
  labels: string[];
  bucketIndexFor: (dateIso: string) => number;
  todayBucketIdx: number;
  periodLabel: string;
} {
  const refIso = localDateString(refDate, tz);
  const [y, m] = refIso.split("-").map((n) => parseInt(n, 10));
  const monthLetters = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (range === "month") {
    const startIso = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const endIso = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    // Bars: 4 weeks within the month — keep simple "w1..w4" labels.
    // bucketIndexFor returns 0..3 based on day-of-month / ~7.
    return {
      startIso,
      endIso,
      bucketCount: 4,
      labels: ["w1", "w2", "w3", "w4"],
      bucketIndexFor: (dateIso: string) => {
        const day = parseInt(dateIso.slice(8, 10), 10);
        return Math.min(3, Math.max(0, Math.floor((day - 1) / 7)));
      },
      todayBucketIdx: 0, // not surfaced when navigating away from current
      periodLabel: `${monthNames[m - 1]} ${y}`,
    };
  }
  // range === "year"
  const startIso = `${y}-01-01`;
  const endIso = `${y}-12-31`;
  return {
    startIso,
    endIso,
    bucketCount: 12,
    labels: monthLetters,
    bucketIndexFor: (dateIso: string) =>
      Math.max(0, Math.min(11, parseInt(dateIso.slice(5, 7), 10) - 1)),
    todayBucketIdx: 0,
    periodLabel: `${y}`,
  };
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
  // Verdict copy reset 2026-05-15 after the user pushed back on
  // "UNDERWATER · 0/10 · You spent more than you earned" framing —
  // exactly the budget-app shaming pattern Tilly is supposed to avoid.
  // Labels are now temperate ("heavier", "tight", "steady") and the
  // closing line points forward ("worth a look together") instead of
  // back ("the line broke"). The score field is preserved for client
  // compat but the year view no longer renders it.
  const topCat = topCategoryName ? topCategoryName : null;
  const rangeWord = range === "year" ? "this year" : "this month";
  if (savingsRate >= 25) {
    return {
      label: "Roomy",
      tone: "good",
      score: Math.min(10, 7 + Math.round((savingsRate - 25) / 5)),
      weatherLabel: "Plenty of room above the line.",
      closingLine: `A roomy ${rangeWord}. Easy to breathe.`,
    };
  }
  if (savingsRate >= 15) {
    return {
      label: "Steady",
      tone: "ok",
      score: Math.min(9, 6 + Math.round((savingsRate - 15) / 5)),
      weatherLabel: "Comfortable breathing room.",
      closingLine: topCat
        ? `${capitalize(topCat)} took the most space. Everything else stayed quiet.`
        : `Steady ${rangeWord}. Nothing pulling out of shape.`,
    };
  }
  if (savingsRate >= 5) {
    return {
      label: "Tight",
      tone: "warn",
      score: Math.min(7, 4 + Math.round((savingsRate - 5) / 5)),
      weatherLabel: "A little tight, still above the line.",
      closingLine: topCat
        ? `${capitalize(topCat)} ran hot ${rangeWord}. Worth one tweak?`
        : `Tight ${rangeWord}. One small change goes a long way.`,
    };
  }
  if (savingsRate >= 0) {
    return {
      label: "On the line",
      tone: "edge",
      score: 3,
      weatherLabel: "Right at the line.",
      closingLine: `Living at the line ${rangeWord}. Let's pick one thing to soften.`,
    };
  }
  return {
    label: "Heavier",
    tone: "bad",
    score: Math.max(0, 2 + Math.round(savingsRate / 5)),
    weatherLabel: `Heavier ${rangeWord} than usual.`,
    closingLine: topCat
      ? `${capitalize(topCat)} took the most this ${rangeWord === "this year" ? "year" : "month"}. Want to look at it together?`
      : `A heavier ${rangeWord}. Want to look at where together?`,
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
  /** Reference date (current period when offset=0, shifted for nav). */
  now: Date;
  tz: string;
  totalSpent: number;
  topCategoryName: string | undefined;
  topCategoryAmt: number;
  /** Inclusive window bounds — kept for the trailing-avg helpers
   * (computeTrailingAvgSavingsRate, computeMonthlyHistory) which still
   * scan their own windows. NOT used for the income total. */
  windowStartIso: string;
  windowEndIso: string;
  /** Single source of truth for income — same array the client renders
   * as "Where it comes from". Horizon income = sum of these amounts,
   * by construction. They can never diverge. */
  incomeSources: SpendCategory[];
}): Promise<SpendHorizon | undefined> {
  const {
    userId,
    householdId,
    range,
    now,
    tz,
    totalSpent,
    topCategoryName,
    windowStartIso,
    incomeSources,
  } = args;
  if (range !== "month" && range !== "year") return undefined;

  // Income total = sum of the income sources we're about to show the
  // user. Single source of truth — the headline "$X EARNED" on the
  // Horizon panel matches the sum of the rows under "Where it comes
  // from this month" exactly, every time. No fallback, no estimate.
  //
  // Previously we fell back to getMonthlyIncome (which estimates from
  // trailing-35-day paychecks) when this month's income rows were
  // empty. That created a phantom number: Horizon would show $14k
  // earned while the income list below it was empty, because the
  // user's actual May deposits were classified as 'other' or
  // 'transfers' instead of 'income'. The honest answer is to show
  // what's actually classified. If income reads $0 mid-month, that's
  // a signal something's misclassified — the user reclassifies via
  // Categories · cash flow, or hits Reset all transactions to
  // re-pull with the latest classifier.
  const income = incomeSources.reduce((s, c) => s + c.amt, 0);

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

/**
 * Build the "Where it comes from" income-source list for a period.
 * Queries plaid_transactions directly (income lives only there, never
 * in the expenses mirror) and groups by merchant name + signature.
 * Returns same shape as discretionary `categories` so the mobile
 * CategoryRow component renders both identically.
 *
 * inWindowEnd is inclusive; pass the period's last day in user TZ
 * (or today's date when looking at the current month, to avoid
 * pulling in future-dated rows that would inflate the total).
 */
async function buildIncomeSources(
  householdId: string,
  windowStartIso: string,
  windowEndIso: string,
): Promise<SpendCategory[]> {
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
      date: plaidTransactions.date,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        gte(plaidTransactions.date, windowStartIso),
        lte(plaidTransactions.date, windowEndIso),
      ),
    );
  if (rows.length === 0) return [];

  // Group by display name. Use merchantName when Plaid provided it,
  // otherwise fall back to the raw `name`. Some employer ACH rows have
  // no merchant — those still need to be groupable.
  const groups = new Map<string, { total: number; txs: Array<{ amount: number; date: string }> }>();
  for (const r of rows) {
    const label = (r.merchantName || r.name || "Income").trim();
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { total: 0, txs: [] };
    g.total += Math.abs(r.amount);
    g.txs.push({ amount: Math.abs(r.amount), date: r.date });
    groups.set(key, g);
  }

  // Sort by amount desc — biggest paycheck source first. No top-N cap
  // here since income tends to have far fewer sources than spend.
  const sorted = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  return sorted.map(([key, g], i) => {
    // Lookup the original display label from one of the rows (preserve
    // original casing).
    const sample = rows.find(
      (r) => (r.merchantName || r.name || "Income").toLowerCase() === key,
    );
    const displayName = (sample?.merchantName || sample?.name || "Income").trim();
    const txList: SpendTx[] = g.txs.map((tx, ti) => ({
      id: `income-${i}-tx-${ti}`,
      name: displayName,
      date: tx.date,
      amt: Math.round(tx.amount),
    }));
    const countStr = g.txs.length === 1 ? "1 deposit" : `${g.txs.length} deposits`;
    return {
      id: `income-${key.replace(/\s+/g, "-")}`,
      name: displayName,
      // 'good' hue maps to t.good on the client — drives the green
      // left-bar + the tinted card background in the income variant.
      hue: "good",
      context: countStr,
      amt: Math.round(g.total),
      transactions: txList,
    };
  });
}

/** True when the window's start matches the local first-of-current-month. */
function isCurrentMonth(now: Date, tz: string, windowStartIso: string): boolean {
  const todayIso = localDateString(now, tz);
  const currentMonthStart = `${todayIso.slice(0, 7)}-01`;
  return windowStartIso === currentMonthStart;
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
    // Spend = everything except income AND except adjustments (transfers,
    // cashback, credit_adjustment). Earlier this fn included them as
    // "whole outflow picture against income", but that's not what the
    // savings-rate calc actually wants — transfers are wallet shuffles
    // and CC payment-backs double-count purchases already in spend. The
    // trailing-avg-savings-rate fed the Horizon verdict, so this is why
    // months sometimes flipped UNDERWATER on weeks they shouldn't have.
    const ADJUSTMENT_CATS = new Set(["transfers", "cashback", "credit_adjustment"]);
    const spend = spendRows
      .filter((r) => {
        const c = (r.ourCategory ?? "").toLowerCase();
        return c !== "income" && !ADJUSTMENT_CATS.has(c);
      })
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
  // Same taxonomy spend-pattern + monthly-summary use: adjustments are
  // own-account moves (transfers), credit card payments-back, and
  // statement credits — they net to zero against the wallet and would
  // double-count real spend if treated as outflow. Previously every
  // non-income row was summed as "spend", which made each month's bar
  // 2-3× the true burn (a $4k CC payment showed up as $4k spend on TOP
  // of the original purchases that built up that bill).
  const ADJUSTMENT_CATS = new Set(["transfers", "cashback", "credit_adjustment"]);
  for (const r of rows) {
    const m = parseInt(r.date.slice(5, 7), 10) - 1;
    if (m < 0 || m > 11) continue;
    const cat = (r.ourCategory ?? "").toLowerCase();
    const abs = Math.abs(r.amount);
    if (cat === "income") incomeByMonth[m] += abs;
    else if (ADJUSTMENT_CATS.has(cat)) continue;
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
