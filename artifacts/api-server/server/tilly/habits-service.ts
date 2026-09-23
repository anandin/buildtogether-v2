/**
 * Money-habit persistence. Routes, the chat tools, Today, and the
 * coach cron all go through here so streaks and events stay consistent.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  habitCheckins,
  moneyHabits,
  plaidTransactions,
  expenses,
  subscriptions,
} from "../../shared/schema";
import { emitEventAsync } from "./event-emitter";
import { computeHabitStats, type HabitCadence } from "./habit-math";
import { suggestHabitsFromSignals, type HabitSuggestion } from "./coach-brief";
import { getUserTimezone, localDateString } from "./user-tz";

export const HABIT_KINDS = [
  "no_spend_day",
  "save_amount",
  "review_pending",
  "gratitude_spend",
  "weekly_checkin",
  "custom",
] as const;

export type HabitKind = (typeof HABIT_KINDS)[number];

const DEFAULTS: Record<HabitKind, { title: string; cadence: HabitCadence }> = {
  no_spend_day: { title: "No-spend day", cadence: "daily" },
  save_amount: { title: "Save a set amount", cadence: "weekly" },
  review_pending: { title: "Review pending", cadence: "weekly" },
  gratitude_spend: { title: "Log a gratitude spend", cadence: "weekly" },
  weekly_checkin: { title: "Weekly money check-in", cadence: "weekly" },
  custom: { title: "Money habit", cadence: "daily" },
};

export type HabitView = {
  id: string;
  title: string;
  kind: string;
  cadence: HabitCadence;
  targetAmount: number | null;
  source: string;
  reason: string | null;
  currentStreak: number;
  bestStreak: number;
  weeklyCompletionRate: number;
  checkedInPeriod: boolean;
  due: boolean;
  createdAt: string;
};

function asCadence(value: string): HabitCadence {
  return value === "weekly" ? "weekly" : "daily";
}

function asKind(value: string): HabitKind {
  return (HABIT_KINDS as readonly string[]).includes(value) ? (value as HabitKind) : "custom";
}

async function todayFor(userId: string, now = new Date()): Promise<string> {
  const tz = await getUserTimezone(userId);
  return localDateString(now, tz);
}

export async function listHabits(
  householdId: string,
  userId: string,
  now = new Date(),
): Promise<HabitView[]> {
  const todayIso = await todayFor(userId, now);
  const rows = await db
    .select()
    .from(moneyHabits)
    .where(and(eq(moneyHabits.householdId, householdId), eq(moneyHabits.active, true)));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const checks = await db
    .select()
    .from(habitCheckins)
    .where(
      and(
        inArray(habitCheckins.habitId, ids),
        eq(habitCheckins.completed, true),
      ),
    );
  const byHabit = new Map<string, string[]>();
  for (const c of checks) {
    const list = byHabit.get(c.habitId) ?? [];
    list.push(c.checkinDate);
    byHabit.set(c.habitId, list);
  }
  return rows
    .map((row) => {
      const stats = computeHabitStats({
        cadence: asCadence(row.cadence),
        checkinDates: byHabit.get(row.id) ?? [],
        todayIso,
        createdIso: row.createdAt.toISOString().slice(0, 10),
      });
      return {
        id: row.id,
        title: row.title,
        kind: row.kind,
        cadence: asCadence(row.cadence),
        targetAmount: row.targetAmount,
        source: row.source,
        reason: row.reason,
        currentStreak: stats.currentStreak,
        bestStreak: stats.bestStreak,
        weeklyCompletionRate: stats.weeklyCompletionRate,
        checkedInPeriod: stats.checkedInPeriod,
        due: stats.due,
        createdAt: row.createdAt.toISOString(),
      };
    })
    .sort((a, b) => Number(b.due) - Number(a.due) || a.title.localeCompare(b.title));
}

export async function createHabit(input: {
  householdId: string;
  userId: string;
  title?: string;
  kind?: string;
  cadence?: string;
  targetAmount?: number | null;
  source?: "user" | "tilly";
  reason?: string | null;
}): Promise<HabitView> {
  const kind = asKind(input.kind ?? "custom");
  const defaults = DEFAULTS[kind];
  const title = (input.title ?? defaults.title).trim().slice(0, 80);
  const cadence = input.cadence === "weekly" || input.cadence === "daily"
    ? input.cadence
    : defaults.cadence;
  const [row] = await db
    .insert(moneyHabits)
    .values({
      householdId: input.householdId,
      userId: input.userId,
      title: title || defaults.title,
      kind,
      cadence,
      targetAmount: input.targetAmount ?? null,
      source: input.source ?? "user",
      reason: input.reason ?? null,
      active: true,
    })
    .returning();
  emitEventAsync({
    userId: input.userId,
    householdId: input.householdId,
    kind: "habit_created",
    payload: { habitId: row!.id, title: row!.title, habitKind: kind, cadence, source: row!.source },
    sourceTable: "money_habits",
    sourceId: row!.id,
  });
  const views = await listHabits(input.householdId, input.userId);
  return views.find((v) => v.id === row!.id) ?? {
    id: row!.id,
    title: row!.title,
    kind: row!.kind,
    cadence: asCadence(row!.cadence),
    targetAmount: row!.targetAmount,
    source: row!.source,
    reason: row!.reason,
    currentStreak: 0,
    bestStreak: 0,
    weeklyCompletionRate: 0,
    checkedInPeriod: false,
    due: true,
    createdAt: row!.createdAt.toISOString(),
  };
}

export async function checkInHabit(input: {
  householdId: string;
  userId: string;
  habitId?: string;
  title?: string;
  date?: string;
  note?: string | null;
  amount?: number | null;
  completed?: boolean;
}): Promise<HabitView | null> {
  const habits = await db
    .select()
    .from(moneyHabits)
    .where(and(eq(moneyHabits.householdId, input.householdId), eq(moneyHabits.active, true)));
  let habit = input.habitId ? habits.find((h) => h.id === input.habitId) : undefined;
  if (!habit && input.title) {
    const needle = input.title.trim().toLowerCase();
    habit = habits.find((h) => h.title.toLowerCase() === needle)
      ?? habits.find((h) => h.title.toLowerCase().includes(needle) || needle.includes(h.title.toLowerCase()));
  }
  if (!habit) return null;
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? input.date
    : await todayFor(input.userId);
  const completed = input.completed !== false;
  await db
    .insert(habitCheckins)
    .values({
      habitId: habit.id,
      householdId: input.householdId,
      userId: input.userId,
      checkinDate: date,
      completed,
      amount: input.amount ?? null,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [habitCheckins.habitId, habitCheckins.checkinDate],
      set: {
        completed,
        amount: input.amount ?? null,
        note: input.note ?? null,
        userId: input.userId,
      },
    });
  emitEventAsync({
    userId: input.userId,
    householdId: input.householdId,
    kind: "habit_checkin",
    payload: {
      habitId: habit.id,
      title: habit.title,
      habitKind: habit.kind,
      date,
      completed,
      note: input.note ?? null,
    },
    sourceTable: "habit_checkins",
    sourceId: habit.id,
  });
  const views = await listHabits(input.householdId, input.userId);
  return views.find((v) => v.id === habit!.id) ?? null;
}

export async function archiveHabit(
  householdId: string,
  userId: string,
  habitId: string,
): Promise<boolean> {
  const updated = await db
    .update(moneyHabits)
    .set({ active: false, archivedAt: new Date() })
    .where(and(eq(moneyHabits.id, habitId), eq(moneyHabits.householdId, householdId)))
    .returning({ id: moneyHabits.id });
  if (!updated.length) return false;
  emitEventAsync({
    userId,
    householdId,
    kind: "habit_archived",
    payload: { habitId },
    sourceTable: "money_habits",
    sourceId: habitId,
  });
  return true;
}

export async function suggestHabits(
  householdId: string,
  userId: string,
): Promise<HabitSuggestion[]> {
  const existing = await listHabits(householdId, userId);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [plaidRows, manualRows, subs, pending] = await Promise.all([
    db
      .select({ date: plaidTransactions.date, category: plaidTransactions.ourCategory })
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
      .select({ date: expenses.date, category: expenses.category })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          sql`${expenses.date} >= ${since}`,
          sql`${expenses.amount} > 0`,
          sql`${expenses.source} <> 'plaid'`,
        ),
      ),
    db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active"))),
    db
      .select({ id: plaidTransactions.id })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "pending_review"),
        ),
      ),
  ]);
  const eat = new Set(["restaurants", "restaurant", "coffee", "food", "dining", "takeout"]);
  const days = new Set<string>();
  for (const row of [...plaidRows, ...manualRows]) {
    const cat = (row.category || "").toLowerCase();
    if (eat.has(cat) || cat.includes("restaurant") || cat.includes("coffee")) days.add(row.date);
  }
  return suggestHabitsFromSignals({
    restaurantDays: days.size,
    subscriptionCount: subs.length,
    pendingCount: pending.length,
    surplus: null,
    existingKinds: existing.map((h) => h.kind),
  });
}
