/**
 * Memory writer — extracts durable observations from chat & actions and
 * persists them to `tilly_memory` (spec §5.2).
 *
 * Triggers:
 *   - After every chat turn — analyze the user's message + Tilly's reply
 *   - On named-dream creation — record value
 *   - On commitment acceptance — record commitment
 *   - On pattern detection — record observation (e.g. "Wednesdays soft spot")
 *
 * The writer uses Claude with a structured-output schema:
 *   { extract: { kind, body, dateLabel, category?, goalId? }[] }
 *
 * Each extracted note is upserted with a "most-recent" flag swap so
 * Profile timeline always shows exactly one pulsing dot at the top.
 *
 * Privacy contract (spec §5.4):
 *   - Never persists raw transactions
 *   - Never persists ephemeral chat (small talk, jokes)
 *   - Only persists what's referenceable later: anxieties, values, commitments,
 *     preferences, and meaningful observations
 */
import type { BTToneKey } from "./tone";

export type MemoryExtractInput = {
  userId: string;
  householdId: string;
  /** What just happened. */
  source: "chat" | "action" | "onboarding" | "inferred";
  /** Conversation id when source=chat; lets us attribute notes back to a turn. */
  conversationId?: string;
  /** Free-text: the chat exchange, or a description of the action/inference. */
  body: string;
  tone: BTToneKey;
  /** ISO timestamp. */
  now: string;
};

export type ExtractedMemory = {
  kind: "observation" | "anxiety" | "value" | "commitment" | "preference";
  body: string; // first-person, in Tilly's voice
  dateLabel: string; // "Today" | "Apr 18" | "Aug 2025"
  category?: string;
  goalId?: string;
};

/**
 * Phase 2 implementation. Returns 0+ memory drafts. The caller is responsible
 * for inserting + flipping the `is_most_recent` flag in a single transaction.
 */
export async function extractMemories(
  _input: MemoryExtractInput,
): Promise<ExtractedMemory[]> {
  throw new Error("Phase 2: extractMemories not yet implemented");
}
