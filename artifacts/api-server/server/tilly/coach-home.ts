/**
 * Coach Home payload for GET /api/tilly/today.
 *
 * Cash, upcoming bills and standing commitments, the habit streak
 * strip, one primary action, and a short briefing. Each read is
 * isolated so a missing table or a Plaid timeout degrades that card
 * instead of blanking Today.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  expenses,
  goals,
  plaidTransactions,
  subscriptions,
  sweepCommitments,
} from "../../shared/schema";
import { readCashPosition, type CashSnapshot } from "./cash-position";
import { listHabits } from "./habits-service";
import {
  composeBriefing,
  pickPrimaryAction,
  type HabitStripItem,
  type PrimaryAction,
  type UpcomingItem,
} from "./coach-brief";
import { getLatestDossier } from "./dossier-rewriter";
import { getUserTimezone, localDateString } from "./user-tz";

export type CoachHome = {
  briefing: string;
  cash: CashSnapshot;
  upcoming: UpcomingItem[];
  habits: HabitStripItem[];
  primaryAction: PrimaryAction;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function upcomingFor(householdId: string, todayIso: string): Promise<UpcomingItem[]> {
  const horizon = addDays(todayIso, 14);
  const [subs, sweeps] = await Promise.all([
    db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active"))),
    db
      .select({
        id: sweepCommitments.id,
        amount: sweepCommitments.amount,
        goalName: goals.name,
      })
      .from(sweepCommitments)
      .leftJoin(goals, eq(sweepCommitments.targetGoalId, goals.id))
      .where(
        and(eq(sweepCommitments.householdId, householdId), eq(sweepCommitments.status, "active")),
      ),
  ]);

  const bills: UpcomingItem[] = [];
  for (const sub of subs) {
    let date = sub.nextChargeAt;
    if (!date && sub.lastChargedAt && sub.cadenceDays) {
      date = addDays(sub.lastChargedAt.slice(0, 10), sub.cadenceDays);
    }
    if (!date) continue;
    const iso = date.slice(0, 10);
    if (iso < todayIso || iso > horizon) continue;
    bills.push({
      kind: "bill",
      id: sub.id,
      label: sub.merchant,
      amount: sub.amount,
      date: iso,
    });
  }
  bills.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const commitments: UpcomingItem[] = sweeps.slice(0, 4).map((s) => ({
    kind: "commitment" as const,
    id: s.id,
    label: s.goalName ? `Save toward ${s.goalName}` : "Payday sweep",
    amount: s.amount,
    date: null,
  }));

  return [...bills.slice(0, 5), ...commitments];
}

async function weekSpend(householdId: string, todayIso: string): Promise<{
  spent: number | null;
  topCategory: string | null;
}> {
  const since = addDays(todayIso, -6);
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({ amount: plaidTransactions.amount, category: plaidTransactions.ourCategory })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "accepted"),
          sql`${plaidTransactions.date} >= ${since}`,
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select({ amount: expenses.amount, category: expenses.category })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          sql`${expenses.date} >= ${since}`,
          sql`${expenses.amount} > 0`,
          sql`${expenses.source} <> 'plaid'`,
        ),
      ),
  ]);
  const rows = [...plaidRows, ...manualRows];
  if (rows.length === 0) return { spent: null, topCategory: null };
  const byCat = new Map<string, number>();
  let spent = 0;
  for (const row of rows) {
    spent += row.amount;
    const cat = (row.category || "other").toLowerCase();
    byCat.set(cat, (byCat.get(cat) ?? 0) + row.amount);
  }
  let topCategory: string | null = null;
  let topAmt = 0;
  for (const [cat, amt] of byCat) {
    if (amt > topAmt) {
      topAmt = amt;
      topCategory = cat;
    }
  }
  return { spent: Math.round(spent), topCategory };
}

export async function buildCoachHome(input: {
  userId: string;
  householdId: string;
  name: string;
  pendingCount?: number;
  now?: Date;
}): Promise<CoachHome> {
  const now = input.now ?? new Date();
  const tz = await getUserTimezone(input.userId);
  const todayIso = localDateString(now, tz);
  const pendingCount = input.pendingCount ?? 0;

  const [cash, habits, upcoming, spend, dossier] = await Promise.all([
    readCashPosition(input.householdId).catch((err) => {
      console.warn("[coach-home] cash failed:", err);
      return {
        liquid: null,
        creditOwed: null,
        source: "none" as const,
        asOf: null,
        accountCount: 0,
      };
    }),
    listHabits(input.householdId, input.userId, now).catch((err) => {
      console.warn("[coach-home] habits failed:", err);
      return [];
    }),
    upcomingFor(input.householdId, todayIso).catch((err) => {
      console.warn("[coach-home] upcoming failed:", err);
      return [] as UpcomingItem[];
    }),
    weekSpend(input.householdId, todayIso).catch((err) => {
      console.warn("[coach-home] spend failed:", err);
      return { spent: null, topCategory: null };
    }),
    getLatestDossier(input.userId).catch(() => null),
  ]);

  const strip: HabitStripItem[] = habits.map((h) => ({
    id: h.id,
    title: h.title,
    kind: h.kind,
    cadence: h.cadence,
    currentStreak: h.currentStreak,
    weeklyCompletionRate: h.weeklyCompletionRate,
    checkedInPeriod: h.checkedInPeriod,
    due: h.due,
  }));

  const content = dossier?.content as { money_arc?: string } | undefined;
  const briefInput = {
    name: input.name,
    dossierArc: content?.money_arc ?? null,
    spentThisWeek: spend.spent,
    topCategory: spend.topCategory,
    liquid: cash.liquid,
    pendingCount,
    upcoming,
    habits: strip,
  };

  return {
    briefing: composeBriefing(briefInput),
    cash,
    upcoming,
    habits: strip,
    primaryAction: pickPrimaryAction(briefInput),
  };
}
