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
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  plaidTransactions,
  tillyMoneySnapshot,
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
};

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

  // 1. Current local month — sum |amount| over income rows.
  const monthRows = await db
    .select({ amount: plaidTransactions.amount, date: plaidTransactions.date })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        gte(plaidTransactions.date, monthStart),
        lte(plaidTransactions.date, todayIso),
      ),
    );
  const monthSum = monthRows.reduce((s, r) => s + Math.abs(r.amount), 0);
  if (monthSum > 0) {
    return {
      amount: Math.round(monthSum * 100) / 100,
      source: "plaid",
      note: `From ${monthRows.length} paycheck${monthRows.length === 1 ? "" : "s"} this month.`,
    };
  }

  // 2. Trailing 35 days — if we see income but not yet in this month
  // (e.g. month just started), use those paychecks to estimate
  // monthly take-home. 35 days is a tight ceiling so we don't pull
  // in a 60-day-old paycheck that's out of date.
  const recentSinceIso = localDaysAgoIso(now, tz, 35);
  const recentRows = await db
    .select({ amount: plaidTransactions.amount, date: plaidTransactions.date })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        gte(plaidTransactions.date, recentSinceIso),
      ),
    )
    .orderBy(asc(plaidTransactions.date));
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
      note: `Estimated from ${cadence} paychecks in the last 35 days.`,
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
function inferCadence(datesIso: string[]): IncomeCadence {
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
): Promise<IncomeCadence> {
  const sinceIso = localDaysAgoIso(now, "America/Toronto", 90);
  const rows = await db
    .select({ date: plaidTransactions.date })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        gte(plaidTransactions.date, sinceIso),
      ),
    );
  return inferCadence(rows.map((r) => r.date));
}
