/**
 * S4 — Nudge log helpers. Every proactive Tilly action goes through
 * recordNudgeSent(); the user's response goes through resolveNudge().
 *
 * The bandit (S5) reads this table to update per-user frame weights.
 *
 * The 15 frames the bandit can pick from (see Ideas42 / Common Cents
 * Lab for under-25 priors):
 */
import { eq, and, desc, isNull } from "drizzle-orm";

import { db } from "../db";
import { tillyNudges, type TillyNudge } from "../../shared/schema";
import { emitEventAsync } from "./event-emitter";

export const FRAMES = [
  "loss_aversion",
  "social_proof",
  "default_taken",
  "anchor",
  "present_bias",
  "mental_accounting",
  "goal_gradient",
  "implementation_intention",
  "fresh_start",
  "endowment",
  "sdt_autonomy",
  "sdt_competence",
  "habit_loop",
  "streak",
  "pre_commitment",
] as const;

export type Frame = (typeof FRAMES)[number];

export type Channel = "push" | "in_app_card" | "chat_inline" | "reminder_fire";

export type Outcome = "accepted" | "dismissed" | "ignored";

export interface RecordNudgeInput {
  userId: string;
  householdId: string;
  frame: Frame;
  channel: Channel;
  body: string;
  context?: Record<string, unknown>;
  sourceTable?: string;
  sourceId?: string;
}

/**
 * Insert a tilly_nudges row + emit a nudge_sent event. Returns the id.
 * Never throws — failures are logged.
 */
export async function recordNudgeSent(
  input: RecordNudgeInput,
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(tillyNudges)
      .values({
        userId: input.userId,
        householdId: input.householdId,
        frame: input.frame,
        channel: input.channel,
        body: input.body,
        context: input.context ?? {},
        sourceTable: input.sourceTable,
        sourceId: input.sourceId,
      })
      .returning();

    emitEventAsync({
      userId: input.userId,
      householdId: input.householdId,
      kind: "nudge_sent",
      payload: {
        nudgeId: row.id,
        frame: input.frame,
        channel: input.channel,
        body: input.body,
        context: input.context ?? {},
      },
      sourceTable: "tilly_nudges",
      sourceId: row.id,
    });
    return row.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[nudge-log] recordNudgeSent failed: ${msg}`);
    return null;
  }
}

/**
 * Mark a nudge resolved. `eventId` is optional — if provided, links the
 * outcome back to the tilly_events row that closed it.
 */
export async function resolveNudge(
  nudgeId: string,
  outcome: Outcome,
  eventId?: string,
): Promise<void> {
  try {
    await db
      .update(tillyNudges)
      .set({
        outcome,
        outcomeAt: new Date(),
        outcomeEventId: eventId ?? null,
      })
      .where(eq(tillyNudges.id, nudgeId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[nudge-log] resolveNudge failed: ${msg}`);
  }
}

/**
 * Find the most recent un-resolved nudge for a user. Used when a button
 * press doesn't carry the nudge_id explicitly (Tilly Learned card flow).
 *
 * `withinHours` defaults to 72h — older pending nudges are stale.
 */
export async function findLatestPendingNudge(
  userId: string,
  filters: { channel?: Channel; withinHours?: number } = {},
): Promise<TillyNudge | null> {
  const cutoffMs = (filters.withinHours ?? 72) * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - cutoffMs);
  const rows = await db
    .select()
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, userId),
        isNull(tillyNudges.outcome),
        ...(filters.channel ? [eq(tillyNudges.channel, filters.channel)] : []),
      ),
    )
    .orderBy(desc(tillyNudges.sentAt))
    .limit(10);
  return rows.find((r) => r.sentAt >= cutoff) ?? null;
}
