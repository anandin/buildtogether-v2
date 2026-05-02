/**
 * Event emitter for the Tilly memory pipeline (S1).
 *
 * Append-only writes to `tilly_events`. The distiller (S2) reads these
 * nightly and produces typed memories (S3 dossier rewrites from those).
 *
 * Fire-and-forget: the response path never blocks on this. Failures get
 * logged but never bubble up to the user. If the table is missing (a
 * pre-migration boot), the function is a noop.
 *
 * Add a new event kind:
 *   1. Append to `EventKind` union below
 *   2. Add the matching payload shape to `EventPayload`
 *   3. Call `emitEvent({ kind: "...", payload: {...} })` at the source
 */
import { db } from "../db";
import { tillyEvents } from "../../shared/schema";

export type EventKind =
  // Chat
  | "chat_user_msg"
  | "chat_tilly_reply"
  // Spend
  | "expense_logged"
  // Reminders (Tilly's promises)
  | "reminder_created"
  | "reminder_cancelled"
  | "reminder_fired"
  // Tilly Learned card on Today
  | "learned_remind_accepted"
  | "learned_dismissed"
  // Dreams
  | "dream_contributed"
  | "dream_created"
  // Profile / settings
  | "tone_changed"
  | "quiet_hours_changed"
  // Push / nudge surface
  | "nudge_sent"
  | "nudge_acted_on"
  | "nudge_ignored";

export type EventPayload = Record<string, unknown>;

export interface EmitEventInput {
  userId: string;
  householdId: string;
  kind: EventKind;
  payload?: EventPayload;
  sourceTable?: string;
  sourceId?: string;
}

/**
 * Insert one event row. Never throws — logs and swallows so the caller's
 * critical path is never broken by an event-log failure.
 */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  try {
    await db.insert(tillyEvents).values({
      userId: input.userId,
      householdId: input.householdId,
      kind: input.kind,
      payload: input.payload ?? {},
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
    });
  } catch (err) {
    // Don't break the user's flow over an event log write. Sentry will
    // pick this up via the global error reporter.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tilly-events] emit failed (kind=${input.kind}): ${msg}`);
  }
}

/**
 * Fire-and-forget variant. Use when you absolutely don't want to await
 * (hot paths). Errors are logged.
 */
export function emitEventAsync(input: EmitEventInput): void {
  void emitEvent(input);
}
