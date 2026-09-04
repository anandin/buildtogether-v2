/**
 * Commitments — the outcome layer (docs/PRD_COMMITMENT_LAYER.md, F2–F4).
 *
 * A commitment is a standing instruction the user consented to ONCE, at
 * a calm moment, that executes automatically on every detected
 * paycheque. This is the mechanism the whole product exists to get
 * adopted: automation changes outcomes; everything else earns the trust
 * for it to be switched on and keeps it from being switched off during
 * a bad month.
 *
 * v0 is honest about what it is. Executing a sweep writes an
 * `earmarked` contribution — the app's ledger, not the bank's. The word
 * "saved" never appears on an earmark. When a money rail exists the
 * same commitment produces `moved` rows and the copy upgrades itself.
 *
 * Setback protocol (F5): a cycle with no room SKIPS the sweep and
 * continues. It never pauses or ends the commitment — inertia works for
 * the saver, and one thin cycle is not a verdict.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { sweepCommitments, goalContributions, goals, type SweepCommitment } from "../../shared/schema";

// ─── Pure planning (unit-tested) ─────────────────────────────────────

export type SweepPlanInput = {
  commitments: Array<{ id: string; targetGoalId: string | null; amount: number; floorAmount: number | null }>;
  /** Paycheque − bills − expected variable, for this cycle. May be negative. */
  trulyFree: number;
  /** Commitment ids that already produced a row for this payday. */
  alreadyExecuted: Set<string>;
  /** Remaining-to-target per goal; a sweep is capped here. */
  remainingByGoal: Map<string, number>;
};

export type SweepPlan = {
  execute: Array<{ commitmentId: string; goalId: string; amount: number }>;
  skipped: Array<{ commitmentId: string; reason: "already_done" | "no_room" | "goal_funded" | "no_target" }>;
};

/**
 * Decide which sweeps run this payday. Room is consumed in order, so
 * two commitments against a thin cycle execute the first and skip the
 * second rather than overdrawing the floor.
 */
export function planSweeps(input: SweepPlanInput): SweepPlan {
  const plan: SweepPlan = { execute: [], skipped: [] };
  let room = input.trulyFree;
  for (const c of input.commitments) {
    if (input.alreadyExecuted.has(c.id)) {
      plan.skipped.push({ commitmentId: c.id, reason: "already_done" });
      continue;
    }
    if (!c.targetGoalId) {
      plan.skipped.push({ commitmentId: c.id, reason: "no_target" });
      continue;
    }
    const remaining = input.remainingByGoal.get(c.targetGoalId) ?? 0;
    if (remaining <= 0) {
      plan.skipped.push({ commitmentId: c.id, reason: "goal_funded" });
      continue;
    }
    const amount = Math.min(Math.round(c.amount), Math.round(remaining));
    const floor = c.floorAmount ?? 0;
    if (room - amount < floor) {
      plan.skipped.push({ commitmentId: c.id, reason: "no_room" });
      continue;
    }
    room -= amount;
    plan.execute.push({ commitmentId: c.id, goalId: c.targetGoalId, amount });
  }
  return plan;
}

/** "done in 12 paydays" — the consequence delta that makes an option a
 * choice rather than a mood. */
export function paydaysToTarget(remaining: number, perPayday: number): number | null {
  if (remaining <= 0) return 0;
  if (perPayday <= 0) return null;
  return Math.ceil(remaining / perPayday);
}

// ─── DB ──────────────────────────────────────────────────────────────

export async function listActiveCommitments(householdId: string): Promise<SweepCommitment[]> {
  return db
    .select()
    .from(sweepCommitments)
    .where(and(eq(sweepCommitments.householdId, householdId), inArray(sweepCommitments.status, ["active", "paused"])))
    .orderBy(desc(sweepCommitments.createdAt));
}

export async function createSweepCommitment(input: {
  householdId: string;
  userId: string;
  goalId: string;
  amount: number;
  consentFrame?: string | null;
  floorAmount?: number | null;
}): Promise<SweepCommitment> {
  // One active sweep per goal — a second consent for the same goal
  // replaces the amount rather than stacking a duplicate.
  const existing = await db
    .select()
    .from(sweepCommitments)
    .where(
      and(
        eq(sweepCommitments.householdId, input.householdId),
        eq(sweepCommitments.targetGoalId, input.goalId),
        eq(sweepCommitments.kind, "sweep"),
        inArray(sweepCommitments.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  if (existing[0]) {
    const [updated] = await db
      .update(sweepCommitments)
      .set({ amount: input.amount, status: "active", consentFrame: input.consentFrame ?? existing[0].consentFrame })
      .where(eq(sweepCommitments.id, existing[0].id))
      .returning();
    await mirrorWeeklyAuto(input.goalId, input.amount);
    return updated;
  }
  const [row] = await db
    .insert(sweepCommitments)
    .values({
      householdId: input.householdId,
      userId: input.userId,
      kind: "sweep",
      targetGoalId: input.goalId,
      amount: input.amount,
      cadence: "per_paycheck",
      status: "active",
      floorAmount: input.floorAmount ?? null,
      consentFrame: input.consentFrame ?? null,
    })
    .returning();
  await mirrorWeeklyAuto(input.goalId, input.amount);
  return row;
}

export async function updateCommitment(
  householdId: string,
  id: string,
  patch: { status?: "active" | "paused" | "ended"; amount?: number; endedReason?: string },
): Promise<SweepCommitment | null> {
  const set: Partial<typeof sweepCommitments.$inferInsert> = {};
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.status) {
    set.status = patch.status;
    if (patch.status === "ended") {
      set.endedAt = new Date();
      set.endedReason = patch.endedReason ?? "user";
    }
  }
  const [row] = await db
    .update(sweepCommitments)
    .set(set)
    .where(and(eq(sweepCommitments.id, id), eq(sweepCommitments.householdId, householdId)))
    .returning();
  if (row?.targetGoalId) {
    await mirrorWeeklyAuto(row.targetGoalId, row.status === "active" ? row.amount : 0);
  }
  return row ?? null;
}

/** Older clients still read goals.weeklyAuto for the "+$X auto" line. */
async function mirrorWeeklyAuto(goalId: string, perPayday: number): Promise<void> {
  await db.update(goals).set({ weeklyAuto: perPayday }).where(eq(goals.id, goalId));
}

/**
 * Execute every active sweep for a detected paycheque. Idempotent per
 * (commitment, paydayDate). Returns what ran and what was skipped so
 * the payday copy can say "set aside $250 for Japan, as agreed".
 */
export async function executeSweepsForPayday(input: {
  householdId: string;
  paydayDate: string;
  trulyFree: number;
}): Promise<{ executed: Array<{ goalId: string; goalName: string; amount: number }>; skipped: SweepPlan["skipped"] }> {
  const active = (await listActiveCommitments(input.householdId)).filter(
    (c) => c.status === "active" && c.kind === "sweep",
  );
  if (active.length === 0) return { executed: [], skipped: [] };

  const goalIds = active.map((c) => c.targetGoalId).filter((g): g is string => !!g);
  const goalRows = goalIds.length
    ? await db.select().from(goals).where(inArray(goals.id, goalIds))
    : [];
  const remainingByGoal = new Map(goalRows.map((g) => [g.id, Math.max(0, g.targetAmount - g.savedAmount)]));

  const done = await db
    .select({ commitmentId: goalContributions.commitmentId })
    .from(goalContributions)
    .where(
      and(
        inArray(goalContributions.commitmentId, active.map((c) => c.id)),
        eq(goalContributions.paydayDate, input.paydayDate),
      ),
    );
  const alreadyExecuted = new Set(done.map((d) => d.commitmentId).filter((x): x is string => !!x));

  const plan = planSweeps({
    commitments: active.map((c) => ({
      id: c.id,
      targetGoalId: c.targetGoalId,
      amount: c.amount,
      floorAmount: c.floorAmount,
    })),
    trulyFree: input.trulyFree,
    alreadyExecuted,
    remainingByGoal,
  });

  const executed: Array<{ goalId: string; goalName: string; amount: number }> = [];
  for (const e of plan.execute) {
    const g = goalRows.find((r) => r.id === e.goalId);
    if (!g) continue;
    await db.transaction(async (tx) => {
      await tx.insert(goalContributions).values({
        goalId: e.goalId,
        amount: e.amount,
        date: input.paydayDate,
        contributor: "auto",
        kind: "earmarked",
        commitmentId: e.commitmentId,
        paydayDate: input.paydayDate,
      });
      await tx
        .update(goals)
        .set({ savedAmount: sql`${goals.savedAmount} + ${e.amount}` })
        .where(eq(goals.id, e.goalId));
    });
    executed.push({ goalId: e.goalId, goalName: g.name, amount: e.amount });
  }
  return { executed, skipped: plan.skipped };
}

/** earmarked vs moved totals per goal — the honesty split for Dreams. */
export async function contributionSplitByGoal(
  goalIds: string[],
): Promise<Map<string, { earmarked: number; moved: number }>> {
  const out = new Map<string, { earmarked: number; moved: number }>();
  if (goalIds.length === 0) return out;
  const rows = await db
    .select({
      goalId: goalContributions.goalId,
      kind: goalContributions.kind,
      total: sql<number>`COALESCE(SUM(${goalContributions.amount}), 0)::float`,
    })
    .from(goalContributions)
    .where(inArray(goalContributions.goalId, goalIds))
    .groupBy(goalContributions.goalId, goalContributions.kind);
  for (const r of rows) {
    const cur = out.get(r.goalId) ?? { earmarked: 0, moved: 0 };
    if (r.kind === "moved") cur.moved += Number(r.total);
    else cur.earmarked += Number(r.total);
    out.set(r.goalId, cur);
  }
  return out;
}
