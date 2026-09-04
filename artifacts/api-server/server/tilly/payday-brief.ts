/**
 * Payday Pulse — the payday-triggered cycle brief.
 *
 * The calendar month is the wrong frame for a biweekly earner: rent and
 * bills don't care which paycheck covers them, and "projected close"
 * answers a question nobody asks on the 14th. The question a biweekly
 * earner actually has is: *this paycheck just landed — how much of it is
 * already spoken for before the next one, and how much is truly mine?*
 *
 * So, the moment a paycheck lands (detected from typical income rows —
 * the same cadence-clean set income-summary projects from, so a $70k
 * one-off can never masquerade as a payday), Tilly:
 *
 *   1. Computes the CYCLE ledger: known bills due before the next
 *      projected paycheck + expected variable burn at the user's
 *      trailing pace → "truly yours" remainder.
 *   2. Suggests a concrete dream sweep sized off the remainder
 *      (pay-yourself-first, but with honest math behind the number).
 *   3. Pushes ONE notification with the split inline (the value is in
 *      the notification body — no "tap to see more" bait), and writes
 *      an observation memory so Home + chat both know about it.
 *
 * Numbers are computed in code; the LLM only phrases. If the LLM is
 * down, a deterministic template ships instead — payday doesn't wait.
 *
 * Idempotent per (user, paydayDate) via the tilly_nudges context, so
 * the hourly cron can retry safely all day.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import {
  expenses,
  goals,
  households,
  plaidTransactions,
  subscriptions,
  tillyMemory,
  tillyNudges,
  tillyTonePref,
  users,
} from "../../shared/schema";
import {
  type IncomeCadence,
  dedupeIncomeRows,
  inferCadence,
  readIncomeRows,
  splitAnomalousIncome,
} from "./income-summary";
import { bucketFor, loadUserOverrides } from "./taxonomy";
import { executeSweepsForPayday, listActiveCommitments } from "./commitments";
import { getUserTimezone, localDateString, localDaysAgoIso } from "./user-tz";
import { sendExpoPush } from "./expo-push";
import { recordNudgeSent } from "./nudge-log";
import { getLLM } from "./llm/factory";
import { buildSystemPrompts } from "./persona";
import type { BTToneKey } from "./tone";

// ── Pure allocation math (unit-tested) ───────────────────────────────

export type CycleBill = { merchant: string; amount: number; date: string };

export type PaydayAllocation = {
  paycheckAmount: number;
  paydayDate: string;
  /** Projected from cadence; null when cadence is irregular/unknown. */
  nextPaydayDate: string | null;
  /** Days in this pay cycle (payday → next payday), 14 fallback. */
  cycleDays: number;
  billsDue: CycleBill[];
  billsTotal: number;
  /** Trailing variable pace × cycleDays. */
  expectedVariable: number;
  /** paycheck − bills − expected variable. Can be negative. */
  trulyFree: number;
  /** Concrete sweep suggestion, or null when there's no room / no dream. */
  dreamSuggestion: { goalId: string; name: string; amount: number } | null;
  /**
   * The live choice (PRD F1): where the truly-free money could point.
   * One row per goal with something left to fund, plus `liquid`. Each
   * carries a consequence delta so it reads as a choice, not a mood.
   * Empty when trulyFree is below the claim floor — no offer on a thin
   * cycle. Liabilities are NOT listed: Plaid liabilities aren't
   * ingested yet (open item in the PRD), and a fake "Visa" option would
   * be exactly the kind of invented abundance this product forbids.
   */
  options: AllocationOption[];
};

export type AllocationOption =
  | {
      kind: "goal";
      goalId: string;
      name: string;
      /** Suggested per-payday sweep. */
      amount: number;
      remainingToTarget: number;
      /** "done in N paydays" at the suggested amount. */
      paydaysToTarget: number;
      /** Paydays saved vs. the user's current standing commitment (0 if none). */
      paydaysSooner: number;
      /** Existing active sweep amount for this goal, if any. */
      currentPerPayday: number;
    }
  | { kind: "liquid"; amount: 0 };

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function cadenceStepDays(cadence: IncomeCadence): number | null {
  return cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : cadence === "monthly" ? 30 : null;
}

export function computePaydayAllocation(input: {
  paycheckAmount: number;
  paydayDate: string;
  cadence: IncomeCadence;
  billsDue: CycleBill[];
  /** Trailing daily variable spend (dollars/day). */
  dailyPace: number;
  dream: { id: string; name: string; targetAmount: number; savedAmount: number } | null;
  /** All goals with room, for the options list. Optional for callers
   * that only need the ledger numbers. */
  goals?: Array<{
    id: string;
    name: string;
    targetAmount: number;
    savedAmount: number;
    /** Active sweep amount already committed per payday, if any. */
    currentPerPayday?: number;
  }>;
}): PaydayAllocation {
  const step = cadenceStepDays(input.cadence);
  const nextPaydayDate = step ? addDaysIso(input.paydayDate, step) : null;
  const cycleDays = step ?? 14;

  const billsTotal = Math.round(input.billsDue.reduce((s, b) => s + b.amount, 0));
  const expectedVariable = Math.round(input.dailyPace * cycleDays);
  const trulyFree = Math.round(input.paycheckAmount - billsTotal - expectedVariable);

  // Dream sweep: 10% of the truly-free remainder, rounded DOWN to $25
  // steps so the number reads intentional, capped at what the dream
  // still needs. Below $100 free we don't suggest — a $5 sweep nudge
  // reads as mockery when the cycle is tight.
  let dreamSuggestion: PaydayAllocation["dreamSuggestion"] = null;
  if (input.dream && trulyFree >= 100) {
    const remainingToTarget = Math.max(
      0,
      Math.round(input.dream.targetAmount - input.dream.savedAmount),
    );
    const tenPercent = Math.floor((trulyFree * 0.1) / 25) * 25;
    const amount = Math.min(Math.max(25, tenPercent), remainingToTarget);
    if (amount >= 25 && remainingToTarget > 0) {
      dreamSuggestion = { goalId: input.dream.id, name: input.dream.name, amount };
    }
  }

  // Options — the same 10% / $25-step sizing as the sweep suggestion,
  // per goal. Suggested amount never exceeds what the goal still needs.
  const options: AllocationOption[] = [];
  if (trulyFree >= 100) {
    const tenPercent = Math.floor((trulyFree * 0.1) / 25) * 25;
    for (const g of input.goals ?? []) {
      const remaining = Math.max(0, Math.round(g.targetAmount - g.savedAmount));
      if (remaining <= 0) continue;
      const amount = Math.min(Math.max(25, tenPercent), remaining);
      if (amount < 25) continue;
      const current = Math.round(g.currentPerPayday ?? 0);
      const withSuggested = Math.ceil(remaining / amount);
      const withCurrent = current > 0 ? Math.ceil(remaining / current) : null;
      options.push({
        kind: "goal",
        goalId: g.id,
        name: g.name,
        amount,
        remainingToTarget: remaining,
        paydaysToTarget: withSuggested,
        paydaysSooner: withCurrent === null ? 0 : Math.max(0, withCurrent - withSuggested),
        currentPerPayday: current,
      });
    }
    // "Leave it liquid" is a first-class option — the choice must be
    // genuine for the autonomy effect to exist at all.
    if (options.length > 0) options.push({ kind: "liquid", amount: 0 });
  }

  return {
    paycheckAmount: Math.round(input.paycheckAmount * 100) / 100,
    paydayDate: input.paydayDate,
    nextPaydayDate,
    cycleDays,
    billsDue: input.billsDue,
    billsTotal,
    expectedVariable,
    trulyFree,
    dreamSuggestion,
    options,
  };
}

/** Deterministic push copy — also the fallback when the LLM is down. */
export function templatePushBody(a: PaydayAllocation): string {
  const free = a.trulyFree;
  const nextBit = a.nextPaydayDate
    ? ` before your ${a.nextPaydayDate.slice(5).replace("-", "/")} paycheck`
    : " this cycle";
  if (free >= 0) {
    return `Paycheck landed: $${Math.round(a.paycheckAmount).toLocaleString()}. ~$${(a.billsTotal + a.expectedVariable).toLocaleString()} is spoken for${nextBit} — about $${free.toLocaleString()} is truly yours.`;
  }
  return `Paycheck landed: $${Math.round(a.paycheckAmount).toLocaleString()}. Heads up — bills + your usual pace run ~$${Math.abs(free).toLocaleString()} past it${nextBit}. Worth a look together.`;
}

/** What the commitment layer did this payday, in one sentence. Pure.
 * Empty when nothing ran and nothing was skipped for lack of room. */
export function sweepsLine(
  executed: Array<{ goalName: string; amount: number }>,
  skipped: Array<{ reason: string }>,
): string {
  if (executed.length > 0) {
    const parts = executed.map((e) => `$${e.amount.toLocaleString()} for ${e.goalName}`);
    const list =
      parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    return `Set aside ${list}, as agreed.`;
  }
  if (skipped.some((s) => s.reason === "no_room")) {
    // Setback protocol: name it, keep the commitment intact, no verdict.
    return "Thin cycle, so I held off on the usual set-aside — it picks back up next paycheque.";
  }
  return "";
}

// ── LLM phrasing ─────────────────────────────────────────────────────

const PulsePhrasingSchema = z.object({
  pushBody: z
    .string()
    .describe(
      "ONE sentence push notification (max ~180 chars) with the split INLINE: paycheck amount, what's spoken for, what's truly theirs. Use the provided numbers verbatim. No emoji, no 'tap to see more' bait — the number IS the value.",
    ),
  cardBody: z
    .string()
    .describe(
      "2-3 sentence in-app version. Name the biggest bill in the cycle and the dream sweep suggestion if present. Tilly voice, plain prose, numbers verbatim, no emoji.",
    ),
});

export type CycleScorecard = {
  predictedFree: number;
  actualFree: number;
  delta: number;
} | null;

export function scorecardLine(s: CycleScorecard): string {
  if (!s) return "";
  if (Math.abs(s.delta) < 25) return " Last cycle landed right on plan.";
  return s.delta > 0
    ? ` Last cycle you closed $${Math.abs(s.delta).toLocaleString()} ahead of plan.`
    : ` Last cycle ran $${Math.abs(s.delta).toLocaleString()} past plan.`;
}

async function phrasePulse(
  a: PaydayAllocation,
  tone: BTToneKey,
  scorecard: CycleScorecard = null,
): Promise<{ pushBody: string; cardBody: string }> {
  const fallback = {
    pushBody: templatePushBody(a),
    cardBody:
      templatePushBody(a) +
      scorecardLine(scorecard) +
      (a.dreamSuggestion
        ? ` Want me to move $${a.dreamSuggestion.amount} toward ${a.dreamSuggestion.name}?`
        : ""),
  };
  try {
    const llm = await getLLM();
    const systemPrompts = await buildSystemPrompts(tone);
    const phrasing = await llm.structuredOutput<z.infer<typeof PulsePhrasingSchema>>({
      systemPrompts,
      messages: [
        {
          role: "user",
          content: `A paycheck just landed. Phrase the Payday Pulse using these computed numbers VERBATIM (do not recompute):\n${JSON.stringify(
            {
              paycheck: a.paycheckAmount,
              paydayDate: a.paydayDate,
              nextPaydayDate: a.nextPaydayDate,
              cycleDays: a.cycleDays,
              billsDueThisCycle: a.billsDue.slice(0, 6),
              billsTotal: a.billsTotal,
              expectedVariableAtUsualPace: a.expectedVariable,
              trulyFree: a.trulyFree,
              dreamSweepSuggestion: a.dreamSuggestion,
              lastCycleScorecard: scorecard
                ? {
                    predictedFree: scorecard.predictedFree,
                    actualFree: scorecard.actualFree,
                    delta: scorecard.delta,
                    framing:
                      "mention in ONE clause — ahead of plan / past plan / on plan",
                  }
                : null,
            },
            null,
            2,
          )}`,
        },
      ],
      schema: PulsePhrasingSchema,
      schemaName: "payday_pulse",
      meta: { route: "payday-pulse" },
    });
    // Guard: every dollar figure in the push must exist in the
    // allocation — the daily-brief bug taught us never to trust
    // phrasing over math. Fall back to the template on any mismatch.
    const allowed = new Set<number>();
    for (const n of [
      a.paycheckAmount,
      a.billsTotal,
      a.expectedVariable,
      a.billsTotal + a.expectedVariable,
      Math.abs(a.trulyFree),
      a.dreamSuggestion?.amount ?? -1,
      ...a.billsDue.map((b) => b.amount),
      ...(scorecard
        ? [Math.abs(scorecard.delta), Math.abs(scorecard.actualFree), Math.abs(scorecard.predictedFree)]
        : []),
    ]) {
      // Accept floor/round/ceil so "$6,744" and "$6,745" both pass for
      // a $6,744.58 paycheck — the guard is for fabrication, not for
      // rounding style.
      allowed.add(Math.floor(n));
      allowed.add(Math.round(n));
      allowed.add(Math.ceil(n));
    }
    const numbersIn = (s: string): number[] =>
      [...s.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)].map((m) =>
        Math.round(parseFloat(m[1].replace(/,/g, ""))),
      );
    const suspicious = [...numbersIn(phrasing.pushBody), ...numbersIn(phrasing.cardBody)].some(
      (n) => !allowed.has(n),
    );
    if (suspicious) {
      console.warn("[payday-pulse] LLM phrasing contained a number not in the allocation — using template");
      return fallback;
    }
    return {
      pushBody: phrasing.pushBody ?? fallback.pushBody,
      cardBody: phrasing.cardBody ?? fallback.cardBody,
    };
  } catch (err) {
    console.warn("[payday-pulse] LLM phrasing failed, using template:", err);
    return fallback;
  }
}

// ── Detection + orchestration ────────────────────────────────────────

async function resolveOwner(householdId: string): Promise<string | null> {
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.coupleId, householdId))
    .limit(1);
  return row[0]?.id ?? null;
}

/** Trailing-28d variable daily pace, honouring the user's taxonomy
 * overrides — same bucketing computeMonthFlow uses. */
export async function trailingVariablePace(
  userId: string,
  householdId: string,
  now: Date,
  tz: string,
): Promise<number> {
  const sinceIso = localDaysAgoIso(now, tz, 28);
  const overrides = await loadUserOverrides(userId);
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({ amount: plaidTransactions.amount, category: plaidTransactions.ourCategory })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "accepted"),
          gte(plaidTransactions.date, sinceIso),
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select({ amount: expenses.amount, category: expenses.category, source: expenses.source })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          gte(expenses.date, sinceIso),
          sql`${expenses.amount} > 0`,
        ),
      ),
  ]);
  let variable = 0;
  for (const r of plaidRows) {
    const b = bucketFor((r.category ?? "").toLowerCase(), overrides);
    if (b === "variable") variable += r.amount;
  }
  for (const r of manualRows) {
    if (r.source === "plaid") continue;
    const b = bucketFor((r.category ?? "").toLowerCase(), overrides);
    if (b === "variable") variable += r.amount;
  }
  return variable / 28;
}

/** Total non-income, non-adjustment outflow between two local dates
 * (inclusive) — what the previous cycle actually consumed. */
async function totalOutflowBetween(
  userId: string,
  householdId: string,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const overrides = await loadUserOverrides(userId);
  const rows = await db
    .select({ amount: plaidTransactions.amount, category: plaidTransactions.ourCategory })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.status, "accepted"),
        gte(plaidTransactions.date, fromIso),
        sql`${plaidTransactions.date} <= ${toIso}`,
        sql`${plaidTransactions.amount} > 0`,
      ),
    );
  let total = 0;
  for (const r of rows) {
    const b = bucketFor((r.category ?? "").toLowerCase(), overrides);
    if (b === "income" || b === "adjustment") continue;
    total += r.amount;
  }
  return total;
}

/** Run the Payday Pulse for ONE household. Exported so the Plaid
 * webhook can fire it minutes after a deposit posts, instead of
 * waiting for the next hourly cron tick. */
export async function runPaydayPulseForHousehold(
  householdId: string,
  now: Date = new Date(),
): Promise<{ paydayDetected: boolean; briefSent: boolean; pushed: boolean }> {
  const none = { paydayDetected: false, briefSent: false, pushed: false };
  const userId = await resolveOwner(householdId);
  if (!userId) return none;
  const tz = await getUserTimezone(userId);

  // Daytime gate — a payday detected by the 3am sync should greet
  // the user at breakfast, not wake them.
  const localHour = parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now),
    10,
  );
  if (localHour < 8 || localHour >= 21) return none;

  // Payday detection over the cadence-clean income set. Yesterday
  // counts too: Plaid often posts the deposit a few hours late, and
  // the brief is still relevant the morning after.
  const todayIso = localDateString(now, tz);
  const yesterdayIso = addDaysIso(todayIso, -1);
  const windowRows = await readIncomeRows(householdId, localDaysAgoIso(now, tz, 90));
  const { typical } = splitAnomalousIncome(dedupeIncomeRows(windowRows));
  // Paydays are paycheck-sized rows, not $0.50 interest credits —
  // require ≥ 25% of the largest typical row.
  const maxTypical = Math.max(...typical.map((r) => Math.abs(r.amount)), 0);
  const landed = typical
    .filter((r) => (r.date === todayIso || r.date === yesterdayIso) && Math.abs(r.amount) >= maxTypical * 0.25)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!landed) return none;

  // Idempotency: one pulse per (user, paydayDate).
  const already = await db
    .select({ id: tillyNudges.id })
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, userId),
        sql`${tillyNudges.context} ->> 'source' = 'payday_pulse'`,
        sql`${tillyNudges.context} ->> 'paydayDate' = ${landed.date}`,
      ),
    )
    .limit(1);
  if (already.length > 0) return { paydayDetected: true, briefSent: false, pushed: false };

  // Cycle ledger inputs.
  const cadence = inferCadence(typical.map((r) => r.date));
  const step = cadenceStepDays(cadence);
  const cycleEndIso = step ? addDaysIso(landed.date, step) : addDaysIso(landed.date, 14);
  const subs = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")));
  const billsDue: CycleBill[] = subs
    .filter((s) => {
      const next = s.nextChargeAt?.slice(0, 10) ?? null;
      return next && next > landed.date && next <= cycleEndIso;
    })
    .map((s) => ({ merchant: s.merchant, amount: s.amount, date: s.nextChargeAt!.slice(0, 10) }))
    .sort((a, b) => b.amount - a.amount);

  const dailyPace = await trailingVariablePace(userId, householdId, now, tz);
  const dreamRow = await db
    .select()
    .from(goals)
    .where(eq(goals.coupleId, householdId))
    .orderBy(desc(goals.createdAt))
    .limit(1);
  const dream = dreamRow[0]
    ? {
        id: dreamRow[0].id,
        name: dreamRow[0].name,
        targetAmount: dreamRow[0].targetAmount,
        savedAmount: dreamRow[0].savedAmount,
      }
    : null;

  const allGoals = await db.select().from(goals).where(eq(goals.coupleId, householdId)).limit(20);
  const activeSweeps = (await listActiveCommitments(householdId)).filter(
    (c) => c.status === "active" && c.kind === "sweep",
  );
  const allocation = computePaydayAllocation({
    paycheckAmount: Math.abs(landed.amount),
    paydayDate: landed.date,
    cadence,
    billsDue,
    dailyPace,
    dream,
    goals: allGoals.map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      savedAmount: g.savedAmount,
      currentPerPayday: activeSweeps.find((c) => c.targetGoalId === g.id)?.amount ?? 0,
    })),
  });

  // The outcome layer: standing commitments execute on the paycheque,
  // before any copy is written, so the pulse reports what HAPPENED
  // ("set aside $250 for Japan, as agreed") rather than asking again.
  // Skips, not pauses, on a thin cycle — see commitments.ts.
  let sweeps: Awaited<ReturnType<typeof executeSweepsForPayday>> = { executed: [], skipped: [] };
  try {
    sweeps = await executeSweepsForPayday({
      householdId,
      paydayDate: landed.date,
      trulyFree: allocation.trulyFree,
    });
  } catch (err) {
    console.warn("[payday-pulse] sweep execution failed (non-fatal):", err);
  }

  // Cycle scorecard — hold the PREVIOUS pulse's forecast accountable.
  // "Last cycle you closed $X ahead of plan" is the streak mechanic
  // without the gamification cringe: it's just the truth, kept.
  let scorecard: { predictedFree: number; actualFree: number; delta: number } | null = null;
  try {
    const prevRows = await db
      .select({ context: tillyNudges.context })
      .from(tillyNudges)
      .where(
        and(
          eq(tillyNudges.userId, userId),
          sql`${tillyNudges.context} ->> 'source' = 'payday_pulse'`,
          sql`${tillyNudges.context} ->> 'paydayDate' < ${landed.date}`,
        ),
      )
      .orderBy(desc(tillyNudges.sentAt))
      .limit(1);
    const prevCtx = prevRows[0]?.context as
      | { paydayDate?: string; allocation?: { paycheckAmount?: number; trulyFree?: number } }
      | undefined;
    if (prevCtx?.paydayDate && typeof prevCtx.allocation?.trulyFree === "number") {
      const prevPaycheck = prevCtx.allocation.paycheckAmount ?? 0;
      const outflow = await totalOutflowBetween(
        userId,
        householdId,
        prevCtx.paydayDate,
        addDaysIso(landed.date, -1),
      );
      const actualFree = Math.round(prevPaycheck - outflow);
      scorecard = {
        predictedFree: Math.round(prevCtx.allocation.trulyFree),
        actualFree,
        delta: actualFree - Math.round(prevCtx.allocation.trulyFree),
      };
    }
  } catch (err) {
    console.warn("[payday-pulse] scorecard failed (non-fatal):", err);
  }

  const [userRow, tonePref] = await Promise.all([
    db
      .select({ expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.query.tillyTonePref.findFirst({ where: eq(tillyTonePref.userId, userId) }),
  ]);
  const phrasing = await phrasePulse(
    allocation,
    (tonePref?.tone as BTToneKey | undefined) ?? "sibling",
    scorecard,
  );
  // Deterministic, appended after the LLM so it can't be dropped or
  // reworded: what the commitment layer actually did this payday. The
  // verb is "set aside" — an earmark — never "saved" or "moved" (F3/P7).
  const sweepLine = sweepsLine(sweeps.executed, sweeps.skipped);
  if (sweepLine) {
    phrasing.pushBody = `${phrasing.pushBody} ${sweepLine}`;
    phrasing.cardBody = `${phrasing.cardBody} ${sweepLine}`;
  }

  // In-app surface: observation memory → Home's learned card + chat
  // retrieval both see it without any client change.
  const [memRow] = await db
    .insert(tillyMemory)
    .values({
      userId,
      householdId,
      kind: "observation",
      body: phrasing.cardBody,
      source: "inferred",
      dateLabel: "Payday",
      isMostRecent: true,
    })
    .returning();

  await recordNudgeSent({
    userId,
    householdId,
    frame: "mental_accounting",
    channel: "push",
    body: phrasing.pushBody,
    context: {
      source: "payday_pulse",
      paydayDate: landed.date,
      allocation: allocation as unknown as Record<string, unknown>,
      scorecard,
      sweeps,
    },
    sourceTable: "tilly_memory",
    sourceId: memRow.id,
  });

  let pushed = false;
  const token = userRow[0]?.expoPushToken;
  if (token) {
    const ticket = await sendExpoPush({
      to: token,
      title: "Payday",
      body: phrasing.pushBody,
      data: { route: "home", kind: "payday_pulse", paydayDate: landed.date },
    });
    pushed = ticket?.status === "ok";
  }
  return { paydayDetected: true, briefSent: true, pushed };
}

export async function runPaydayPulseAll(now: Date = new Date()): Promise<{
  households: number;
  paydaysDetected: number;
  briefsSent: number;
  pushed: number;
}> {
  const allHouseholds = await db.select({ id: households.id }).from(households).limit(1000);
  let paydaysDetected = 0;
  let briefsSent = 0;
  let pushed = 0;
  for (const h of allHouseholds) {
    try {
      const r = await runPaydayPulseForHousehold(h.id, now);
      if (r.paydayDetected) paydaysDetected++;
      if (r.briefSent) briefsSent++;
      if (r.pushed) pushed++;
    } catch (err) {
      console.warn("[payday-pulse] household failed:", h.id, err);
    }
  }
  return { households: allHouseholds.length, paydaysDetected, briefsSent, pushed };
}
