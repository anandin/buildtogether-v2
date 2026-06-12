/**
 * Income summary — monthly take-home and paycheck cadence detection.
 *
 * Source order (per user pref "Both, Plaid wins"):
 *   1. Plaid INCOME rows in the current local month (since SS1 we let
 *      these through plaid sync with ourCategory='income' and a
 *      negative amount). Sum |amount|.
 *   2. If no current-month income but ≥1 income row in the last 35
 *      days, scale that paycheck into a monthly estimate based on
 *      detected cadence.
 *   3. tillyMoneySnapshot.monthlyIncome (self-reported at onboarding).
 *   4. None — let downstream callers decide whether to hide the
 *      "this month" card or show a "tell Tilly your income" prompt.
 *
 * All date math goes through the user's TZ (server/tilly/user-tz.ts)
 * so month boundaries align with the user's lived "May 1 - May 31",
 * not the UTC clock that Vercel runs in.
 */
import { and, desc, eq, gte, like, ne } from "drizzle-orm";
import { db } from "../db";
import {
  plaidTransactions,
  tillyMoneySnapshot,
  userPreferences,
} from "../../shared/schema";
import {
  getUserTimezone,
  localDateString,
  localDaysAgoIso,
} from "./user-tz";

export type IncomeSource = "plaid" | "plaid-estimate" | "self-report" | "none";

export type MonthlyIncome = {
  /** Take-home for the current local month. 0 when source = "none". */
  amount: number;
  source: IncomeSource;
  /** Optional explanation surface text (used by chat extraSystem). */
  note?: string;
  /** Large credits categorized 'income' that were EXCLUDED from `amount`
   * because they don't look like paychecks (> 3× the median income row).
   * Surfaced so the hero/chat can ask "is this real income?" instead of
   * silently projecting a $173k month off a one-off transfer. */
  excluded?: Array<{ merchant: string | null; amount: number; date: string }>;
};

// ── Income read hygiene ──────────────────────────────────────────────
// The spend path reads through spend-pattern's readAllTransactions which
// filters status + collapses bank re-posts. The income path used to read
// plaid_transactions RAW — so Plaid-removed pending ghosts (status=
// 'ignored', see the `removed` handler in routes.ts) and re-posted
// deposits double-counted, and a single misclassified TRANSFER_IN (e.g.
// an inter-bank move or incoming e-transfer) inflated every projection
// downstream all the way to the Home hero. These helpers give income
// reads the same defenses. Pure + exported for unit tests.

export type IncomeRowLite = {
  amount: number;
  date: string;
  merchantName?: string | null;
  name?: string | null;
};

/** Collapse same-day same-|amount| same-merchant income rows — the exact
 * dedupe rule spend-pattern.ts uses, because banks re-post deposits with
 * fresh plaid ids and pending→posted swaps briefly coexist. */
export function dedupeIncomeRows<T extends IncomeRowLite>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const label = (r.merchantName ?? r.name ?? "").trim().toLowerCase();
    const key = `${r.date}|${Math.abs(r.amount).toFixed(2)}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Lower median of |amounts| — robust to a single huge pollutant in a
 * way the mean is not (one $86k transfer drags a mean of 8 paychecks
 * above $12k; the median doesn't move). */
export function medianIncomeAmount(rows: IncomeRowLite[]): number {
  if (rows.length === 0) return 0;
  const sorted = rows.map((r) => Math.abs(r.amount)).sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Stable identity for an income anomaly — used as the preference key
 * when the user confirms a quarantined deposit is real income. */
export function incomeAnomalyKey(row: IncomeRowLite): string {
  return `${row.date}|${Math.abs(row.amount).toFixed(2)}`;
}

/** Load the set of anomaly keys this user has confirmed as real income
 * (written by the confirmDepositAsIncome chat tool). */
export async function loadConfirmedIncomeKeys(
  userId: string | null,
): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ key: userPreferences.key })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.scope, "plaid"),
        like(userPreferences.key, "income_anomaly_confirmed.%"),
      ),
    );
  return new Set(rows.map((r) => r.key.slice("income_anomaly_confirmed.".length)));
}

/** Split income rows into paycheck-shaped (`typical`) vs `anomalous`
 * (> 3× median AND ≥ $1000). Anomalous rows are almost always
 * misclassified TRANSFER_IN credits — inter-account moves, big
 * e-transfers — that must not feed cadence/projection math until the
 * user confirms them. Needs ≥ 2 rows to judge; with 0-1 rows everything
 * is typical (no baseline to compare against).
 *
 * `confirmedKeys` (from loadConfirmedIncomeKeys) routes user-confirmed
 * anomalies to `confirmedOneOff`: real income that counts toward month
 * totals but must NEVER feed cadence or typical-paycheck math — a $70k
 * bonus is income, not a payday pattern. */
export function splitAnomalousIncome<T extends IncomeRowLite>(
  rows: T[],
  confirmedKeys: Set<string> = new Set(),
): { typical: T[]; anomalous: T[]; confirmedOneOff: T[]; medianAmount: number } {
  const medianAmount = medianIncomeAmount(rows);
  if (rows.length < 2 || medianAmount <= 0) {
    return { typical: rows, anomalous: [], confirmedOneOff: [], medianAmount };
  }
  const typical: T[] = [];
  const anomalous: T[] = [];
  const confirmedOneOff: T[] = [];
  for (const r of rows) {
    const a = Math.abs(r.amount);
    if (a > 3 * medianAmount && a >= 1000) {
      if (confirmedKeys.has(incomeAnomalyKey(r))) confirmedOneOff.push(r);
      else anomalous.push(r);
    } else {
      typical.push(r);
    }
  }
  return { typical, anomalous, confirmedOneOff, medianAmount };
}

/** All income rows for the trailing window, deduped, excluding rows
 * Plaid removed (`status='ignored'`). We deliberately do NOT require
 * status='accepted' — paychecks can sit in pending_review when
 * auto-accept doesn't fire, and dropping them would zero out income. */
export async function readIncomeRows(
  householdId: string,
  sinceIso: string,
): Promise<IncomeRowLite[]> {
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      date: plaidTransactions.date,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        ne(plaidTransactions.status, "ignored"),
        gte(plaidTransactions.date, sinceIso),
      ),
    );
  return dedupeIncomeRows(rows);
}

export type IncomeCadence = "biweekly" | "monthly" | "weekly" | "irregular" | "unknown";

/**
 * Compute the user's first-of-month date string in their TZ. Plaid tx
 * `date` is a YYYY-MM-DD string (calendar-only), so we compare against
 * the local YYYY-MM-DD bounds.
 */
function localMonthStart(now: Date, tz: string): string {
  const today = localDateString(now, tz);
  const [y, m] = today.split("-").map((n) => parseInt(n, 10));
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export async function getMonthlyIncome(
  userId: string | null,
  householdId: string,
  now: Date = new Date(),
): Promise<MonthlyIncome> {
  const tz = await getUserTimezone(userId);
  const monthStart = localMonthStart(now, tz);
  const todayIso = localDateString(now, tz);

  // One trailing-90d read powers both the current-month sum and the
  // anomaly baseline. The 90d window gives the median enough real
  // paychecks that a giant misclassified credit this month stands out.
  const [windowRows, confirmedKeys] = await Promise.all([
    readIncomeRows(householdId, localDaysAgoIso(now, tz, 90)),
    loadConfirmedIncomeKeys(userId),
  ]);
  const { typical, anomalous, confirmedOneOff } = splitAnomalousIncome(
    windowRows,
    confirmedKeys,
  );

  // 1. Current local month — paycheck-shaped rows PLUS any one-off the
  // user explicitly confirmed as income (bonus, vacation payout). The
  // confirmed rows count toward the month, never toward cadence.
  const monthRows = typical.filter(
    (r) => r.date >= monthStart && r.date <= todayIso,
  );
  const monthConfirmed = confirmedOneOff.filter(
    (r) => r.date >= monthStart && r.date <= todayIso,
  );
  const monthAnomalies = anomalous.filter(
    (r) => r.date >= monthStart && r.date <= todayIso,
  );
  const excluded = monthAnomalies.map((r) => ({
    merchant: (r.merchantName ?? r.name ?? null) || null,
    amount: Math.round(Math.abs(r.amount) * 100) / 100,
    date: r.date,
  }));
  const excludedNote = monthAnomalies.length
    ? ` Not counting ${monthAnomalies.length} large deposit${monthAnomalies.length === 1 ? "" : "s"} ($${Math.round(monthAnomalies.reduce((s, r) => s + Math.abs(r.amount), 0)).toLocaleString()}) that ${monthAnomalies.length === 1 ? "doesn't" : "don't"} look like a paycheck — confirm if real income.`
    : "";
  const confirmedNote = monthConfirmed.length
    ? ` Includes ${monthConfirmed.length} confirmed one-off deposit${monthConfirmed.length === 1 ? "" : "s"} ($${Math.round(monthConfirmed.reduce((s, r) => s + Math.abs(r.amount), 0)).toLocaleString()}).`
    : "";
  const monthSum =
    monthRows.reduce((s, r) => s + Math.abs(r.amount), 0) +
    monthConfirmed.reduce((s, r) => s + Math.abs(r.amount), 0);
  if (monthSum > 0) {
    return {
      amount: Math.round(monthSum * 100) / 100,
      source: "plaid",
      note: `From ${monthRows.length} paycheck${monthRows.length === 1 ? "" : "s"} this month.${confirmedNote}${excludedNote}`,
      ...(excluded.length ? { excluded } : {}),
    };
  }

  // 2. Trailing 35 days — if we see income but not yet in this month
  // (e.g. month just started), use those paychecks to estimate
  // monthly take-home. 35 days is a tight ceiling so we don't pull
  // in a 60-day-old paycheck that's out of date.
  const recentSinceIso = localDaysAgoIso(now, tz, 35);
  const recentRows = typical
    .filter((r) => r.date >= recentSinceIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (recentRows.length > 0) {
    const cadence = inferCadence(recentRows.map((r) => r.date));
    const recentSum = recentRows.reduce((s, r) => s + Math.abs(r.amount), 0);
    // Annualize-then-divide approach: each row contributes its full
    // value once per cadence-cycle to a monthly figure. Biweekly =
    // 26 cycles/year ÷ 12 ≈ 2.17 per month. Weekly ≈ 4.33. Monthly =
    // 1. Irregular = best-effort: scale by (30 / observed-span-days).
    const monthlyEstimate =
      cadence === "biweekly"
        ? (recentSum / recentRows.length) * 2.17
        : cadence === "weekly"
          ? (recentSum / recentRows.length) * 4.33
          : cadence === "monthly"
            ? recentSum / recentRows.length
            : recentSum * (30 / observedSpanDays(recentRows.map((r) => r.date)));
    return {
      amount: Math.round(monthlyEstimate * 100) / 100,
      source: "plaid-estimate",
      note: `Estimated from ${cadence} paychecks in the last 35 days.${excludedNote}`,
      ...(excluded.length ? { excluded } : {}),
    };
  }

  // 3. Self-report from onboarding (or later chat capture).
  if (householdId) {
    const snap = await db
      .select()
      .from(tillyMoneySnapshot)
      .where(eq(tillyMoneySnapshot.householdId, householdId))
      .orderBy(desc(tillyMoneySnapshot.createdAt))
      .limit(1);
    const reported = snap[0]?.monthlyIncome;
    if (typeof reported === "number" && reported > 0) {
      return {
        amount: Math.round(reported * 100) / 100,
        source: "self-report",
        note: "You told me this at sign-up.",
      };
    }
  }

  return { amount: 0, source: "none" };
}

/**
 * Walk income tx dates, compute gap-day distribution, classify the
 * cadence. Tolerant: 12-16 day gaps round to biweekly, 25-35 to
 * monthly. Anything else stays irregular.
 */
export function inferCadence(datesIso: string[]): IncomeCadence {
  if (datesIso.length < 2) return "unknown";
  const sorted = [...datesIso].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d1 = new Date(sorted[i - 1] + "T00:00:00Z").getTime();
    const d2 = new Date(sorted[i] + "T00:00:00Z").getTime();
    gaps.push(Math.round((d2 - d1) / (24 * 3600 * 1000)));
  }
  const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (median >= 5 && median <= 9) return "weekly";
  if (median >= 12 && median <= 16) return "biweekly";
  if (median >= 25 && median <= 35) return "monthly";
  return "irregular";
}

function observedSpanDays(datesIso: string[]): number {
  if (datesIso.length === 0) return 30;
  const sorted = [...datesIso].sort();
  const d1 = new Date(sorted[0] + "T00:00:00Z").getTime();
  const d2 = new Date(sorted[sorted.length - 1] + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((d2 - d1) / (24 * 3600 * 1000)));
}

export async function getIncomeCadence(
  householdId: string,
  now: Date = new Date(),
  tz: string = "America/Toronto",
): Promise<IncomeCadence> {
  // tz parameter defaults to Toronto (the beachhead) but should be
  // overridden by callers who have the user's actual timezone — pull
  // from getUserTimezone() at the call site. The 90-day cadence
  // window is mostly tz-insensitive (gap-day medians don't shift
  // meaningfully across timezones) but keeping it consistent matters
  // for downstream call points that compare dates.
  const sinceIso = localDaysAgoIso(now, tz, 90);
  const rows = await readIncomeRows(householdId, sinceIso);
  const { typical } = splitAnomalousIncome(rows);
  return inferCadence(typical.map((r) => r.date));
}

/**
 * Project income that will land between today and month-end based on
 * paycheck cadence. Critical for the Today hero's "projected close"
 * number — without it, mid-month users with biweekly pay see a doom
 * forecast because Tilly only counts the one paycheck that's already
 * hit, ignoring the second one she should KNOW is coming.
 *
 * Cadence rules:
 *   biweekly → next paycheck = lastDate + 14d, repeat until > monthEnd
 *   semi-monthly approximation: biweekly already handles 2/month for
 *     most cases. True semi-monthly (15th + last day) cadence isn't
 *     detected separately yet — biweekly is close enough.
 *   monthly → one paycheck per month; if already hit, none more
 *   weekly → 4-5 per month; project remaining
 *   irregular / unknown → no projection (return 0); we don't fabricate
 *
 * Typical amount = mean of trailing income amounts (90d). Heuristic but
 * tracks reality well enough for "you'll close near $X".
 */
export async function projectRemainingIncomeForMonth(
  householdId: string,
  now: Date,
  tz: string,
): Promise<{
  projectedRemaining: number;
  cadence: IncomeCadence;
  typicalAmount: number;
  nextPaycheckDate: string | null;
}> {
  const sinceIso = localDaysAgoIso(now, tz, 90);
  const todayIso = localDateString(now, tz);
  const [yearStr, monthStr] = todayIso.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEndIso = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, "0")}`;

  const windowRows = await readIncomeRows(householdId, sinceIso);
  const { typical: rows } = splitAnomalousIncome(windowRows);

  if (rows.length === 0) {
    return { projectedRemaining: 0, cadence: "unknown", typicalAmount: 0, nextPaycheckDate: null };
  }

  const cadence = inferCadence(rows.map((r) => r.date));
  // Median, not mean — a single misclassified five-figure TRANSFER_IN
  // in the window must not turn every projected paycheck into a
  // five-figure paycheck. (This is the bug that put "$173,496 coming
  // before month-end" on the Home hero.)
  const typicalAmount = medianIncomeAmount(rows);

  const sortedDates = [...rows.map((r) => r.date)].sort();
  const lastDate = sortedDates[sortedDates.length - 1];
  if (!lastDate) {
    return { projectedRemaining: 0, cadence, typicalAmount, nextPaycheckDate: null };
  }

  const stepDays =
    cadence === "weekly" ? 7 :
    cadence === "biweekly" ? 14 :
    cadence === "monthly" ? 30 :
    null;
  if (!stepDays) {
    return { projectedRemaining: 0, cadence, typicalAmount, nextPaycheckDate: null };
  }

  // Walk forward from lastDate by stepDays. Each landing inside
  // (today, monthEnd] adds one typicalAmount. Cap at 6 hops to avoid
  // any infinite-loop edge case.
  const addDaysIso = (iso: string, days: number): string => {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  };

  let cursor = lastDate;
  let firstUpcoming: string | null = null;
  let projected = 0;
  for (let hop = 0; hop < 6; hop++) {
    cursor = addDaysIso(cursor, stepDays);
    if (cursor > monthEndIso) break;
    if (cursor > todayIso) {
      projected += typicalAmount;
      if (!firstUpcoming) firstUpcoming = cursor;
    }
  }

  return {
    projectedRemaining: Math.round(projected * 100) / 100,
    cadence,
    typicalAmount: Math.round(typicalAmount * 100) / 100,
    nextPaycheckDate: firstUpcoming,
  };
}
