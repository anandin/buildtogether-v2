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
 * Implementation uses Anthropic's structured outputs to constrain the
 * extraction shape: `{ extract: ExtractedMemory[] }`. The persona is in the
 * system block so Tilly's voice and privacy contract are enforced at the
 * model level, not bolted on by a wrapper.
 *
 * Privacy contract (spec §5.4) — enforced by the system prompt:
 *   - Never persists raw transactions
 *   - Never persists ephemeral chat (small talk, jokes)
 *   - Only persists what's referenceable later: anxieties, values, commitments,
 *     preferences, and meaningful observations
 *
 * The caller is responsible for inserting the returned drafts and flipping
 * the `is_most_recent` flag in a single transaction.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  TILLY_MODEL,
  TILLY_DEFAULT_MAX_TOKENS,
  personaSystemBlock,
  toneSystemBlock,
  tilly,
} from "./persona";
import type { BTToneKey } from "./tone";

// ─── Schema ────────────────────────────────────────────────────────────────

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
  category: z
    .string()
    .optional()
    .describe("Spending category if relevant (e.g. 'Coffee'), else omit."),
  goalIdHint: z
    .string()
    .optional()
    .describe("Dream/goal name if this memory references one, else omit. The caller resolves the actual goalId."),
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

// ─── Input shape ───────────────────────────────────────────────────────────

export type MemoryExtractInput = {
  userId: string;
  householdId: string;
  source: "chat" | "action" | "onboarding" | "inferred";
  /** Conversation id when source=chat; lets us attribute notes back to a turn. */
  conversationId?: string;
  /**
   * The exchange to analyze. For source=chat, format as:
   *   "USER: <user message>\nTILLY: <tilly reply>"
   * For other sources, a free-text description of what happened.
   */
  body: string;
  tone: BTToneKey;
  /** ISO timestamp; "Today" labels are computed from this. */
  now: string;
};

// ─── Implementation ────────────────────────────────────────────────────────

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

/**
 * Extract memories from a chat exchange or action. Returns 0+ drafts; the
 * caller persists them to `tilly_memory` and updates the most-recent flag.
 *
 * Returns an empty array on extraction failure (logged) — memory extraction
 * should never block a chat turn from completing. If Claude returns nothing
 * parseable, we just don't save anything from this turn.
 */
export async function extractMemories(
  input: MemoryExtractInput,
): Promise<ExtractedMemory[]> {
  const userContent = `Source: ${input.source}${input.conversationId ? ` (conversation ${input.conversationId})` : ""}
Time: ${input.now}

Exchange to analyze:
${input.body}

Extract 0–3 memories worth keeping. Empty array if nothing here is durable.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  try {
    const response = await tilly().messages.parse({
      model: TILLY_MODEL,
      max_tokens: TILLY_DEFAULT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      system: [
        personaSystemBlock(),
        toneSystemBlock(input.tone),
        { type: "text", text: EXTRACTION_SYSTEM },
      ],
      messages,
      output_config: {
        format: zodOutputFormat(MemoryExtractionSchema),
      },
    });

    return response.parsed_output?.extract ?? [];
  } catch (err) {
    // Memory extraction must never block a chat reply. Log and return empty.
    console.error("extractMemories failed:", err);
    return [];
  }
}
