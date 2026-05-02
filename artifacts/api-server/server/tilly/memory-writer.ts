/**
 * Memory writer — extracts durable observations from chat & actions and
 * persists them to `tilly_memory` (spec §5.2).
 *
 * Flow per chat turn:
 *   1. extractMemories(...) returns 0+ ExtractedMemory drafts
 *   2. Caller (chat route) computes an embedding for each draft body
 *   3. Caller inserts in a tx, flips is_most_recent flag
 *
 * Privacy contract (spec §5.4) — enforced by the system prompt:
 *   - Never persists raw transactions
 *   - Never persists ephemeral chat (small talk, jokes)
 *   - Only persists what's referenceable later: anxieties, values, commitments,
 *     preferences, and meaningful observations
 */
import { z } from "zod";

import { getLLM } from "./llm/factory";
import { buildSystemPrompts } from "./persona";
import type { BTToneKey } from "./tone";

const ExtractedMemorySchema = z.object({
  kind: z
    .enum(["observation", "anxiety", "value", "commitment", "preference"])
    .describe(
      "Kind of memory. observation=behavioral note, anxiety=verbal cue about money worry, value=stated priority/dream, commitment=shared rule, preference=quiet hours/tone/threshold.",
    ),
  body: z
    .string()
    .describe(
      "First-person, in Tilly's voice (e.g. 'You skipped DoorDash twice this week. I noticed — that's real.'). 1–2 short sentences. Specific, not generic.",
    ),
  dateLabel: z
    .string()
    .describe(
      "Display label for the timeline: 'Today', 'Apr 18', 'Aug 2025'. Use 'Today' for things observed in this turn.",
    ),
  // OpenRouter providers vary on null vs absent fields. Allow both.
  category: z
    .string()
    .nullable()
    .optional()
    .describe("Spending category if relevant (e.g. 'Coffee'). Omit or null if not applicable."),
  goalIdHint: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Dream/goal name if this memory references one. Omit or null if not applicable. The caller resolves the actual goalId.",
    ),
});

export const MemoryExtractionSchema = z.object({
  extract: z
    .array(ExtractedMemorySchema)
    .describe(
      "0–3 memories worth saving. Empty array if nothing in this exchange is durable. NEVER include raw transactions or generic chitchat.",
    ),
});

export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;
export type MemoryExtraction = z.infer<typeof MemoryExtractionSchema>;

export type MemoryExtractInput = {
  userId: string;
  householdId: string;
  source: "chat" | "action" | "onboarding" | "inferred";
  conversationId?: string;
  body: string;
  tone: BTToneKey;
  now: string;
};

const EXTRACTION_SYSTEM = `You are doing memory extraction, not chat. Your job is to read the exchange below and decide what (if anything) is worth remembering durably.

What to save:
- Anxieties — explicit verbal cues like "I'm broke", "I'm stressed about rent", "money makes me anxious"
- Values — when the student names something they're saving toward or describes what matters to them
- Commitments — when you proposed a rule and the student agreed (or vice versa)
- Preferences — quiet hours, tone, alert thresholds, things they want you to do/not do
- Observations — behavioral patterns you can confirm (e.g. "you skipped DoorDash twice this week"), but ONLY if the supporting facts are in the exchange

What NOT to save:
- Single transactions ("you spent $5 at Stumptown") — these are in the ledger, not the relationship
- Small talk, jokes, social pleasantries
- Things the student didn't say (don't infer feelings they haven't expressed)
- Anything PII-sensitive that the student would be surprised to find later

Return 0–3 memories. Empty array is the right answer most of the time. Quality over quantity. Each memory is in YOUR voice, first-person, like you're writing it down for yourself to find later.`;

export async function extractMemories(
  input: MemoryExtractInput,
): Promise<ExtractedMemory[]> {
  const userContent = `Source: ${input.source}${input.conversationId ? ` (conversation ${input.conversationId})` : ""}
Time: ${input.now}

Exchange to analyze:
${input.body}

Extract 0–3 memories worth keeping. Empty array if nothing here is durable.`;

  try {
    const systemPrompts = await buildSystemPrompts(input.tone, [EXTRACTION_SYSTEM]);
    const llm = await getLLM();

    const result = await llm.structuredOutput<MemoryExtraction>({
      systemPrompts,
      messages: [{ role: "user", content: userContent }],
      schema: MemoryExtractionSchema,
      schemaName: "memory_extraction",
    });
    return result.extract;
  } catch (err: any) {
    // Memory extraction must never block a chat reply. Log details so we
    // can iterate on the prompt or schema next time, then return empty.
    console.error(
      "extractMemories failed:",
      err?.message ?? err,
      "\nPrompt body (truncated):",
      input.body.slice(0, 200),
    );
    return [];
  }
}
