/**
 * Dream-creation tool extractor.
 *
 * Mirrors extract-reminder.ts: a small Haiku pass that runs AFTER Tilly's
 * main chat reply and decides whether the user just asked her to create a
 * savings goal ("a dream") in this turn. When yes, the chat handler inserts
 * the goal and surfaces the new dream as a toolResult on the WireMessage.
 *
 * Why a second pass instead of true tool-use: the existing chat path uses
 * plain text generation, and shipping a structured-output rewrite of the
 * full conversation is a bigger change than the current iteration warrants.
 * The extractor pattern is already proven for reminders and gives us
 * deterministic, post-hoc tool execution without restructuring the LLM call.
 */
import { z } from "zod";
import { OpenRouterLLM } from "./llm/openrouter";

const ExtractSchema = z.object({
  shouldCreate: z
    .boolean()
    .describe(
      "true ONLY when the user's message in this turn explicitly asks Tilly to create / set up / add / track a savings goal or dream. False if Tilly merely TALKED about a dream without the user requesting one. False if the user is asking a question about an existing dream.",
    ),
  name: z
    .string()
    .describe(
      "Short title for the dream — what the user is saving for. Cleaned of dollar amounts. e.g. 'Switch 2', 'Barcelona trip', 'AirPods Pro'. Empty string if shouldCreate=false.",
    ),
  targetAmount: z
    .number()
    .describe(
      "Total dollar amount the user wants to save. Use the explicit number if mentioned. If only a monthly amount is given, multiply by a sensible default (12 months → estimate). Use 0 if no amount can be inferred.",
    ),
  monthlyContribution: z
    .number()
    .describe(
      "Monthly auto-save the user mentioned, in dollars. 0 if not mentioned (Tilly will pick).",
    ),
  emoji: z
    .string()
    .describe(
      "ONE emoji or single glyph that fits the dream. Default to ✺. e.g. 🎮 for Switch 2, 🏖️ for Barcelona.",
    ),
});

export type DreamCreateExtraction = z.infer<typeof ExtractSchema>;

const SYSTEM_PROMPT = `You are a precise tool-call extractor. Given the user's most recent message and Tilly's reply, decide whether THIS turn contains a clear request from the user to create a new savings goal (a "dream"), and extract the parameters.

Rules:
- shouldCreate = true ONLY when the user explicitly asked: "create a dream", "set up a goal", "track this for X", "add Y to my dreams", "save for Z", "I want to save \$N for Z", etc. The phrasing must be a request from the USER, not Tilly's idea.
- shouldCreate = false when:
  - Tilly suggested a dream and the user hasn't agreed yet.
  - The user is asking ABOUT an existing dream.
  - The user is just describing a future purchase casually ("I'll probably get an iPad someday").
  - Tilly's reply talked about dreams without the user requesting creation.
- When shouldCreate=true, the params describe the new dream. Extract the dollar target if explicit; otherwise estimate it sensibly (e.g. Switch 2 ≈ \$650, Barcelona trip ≈ \$2000 — use real-world prices, not placeholders).
- monthlyContribution: only if the user mentioned one. Otherwise 0.
- emoji: pick something meaningful (🎮 game, 🏖️ vacation, 🚗 car, 📱 phone, 💍 ring, 💻 laptop). Default ✺ if uncertain.

Output the structured fields. Do not write prose.`;

export async function extractDreamCreate(input: {
  userMessage: string;
  tillyReply: string;
  meta?: { userId?: string | null };
}): Promise<DreamCreateExtraction | null> {
  try {
    const llm = new OpenRouterLLM(
      process.env.TILLY_TOOL_EXTRACTOR_MODEL || "anthropic/claude-haiku-4.5",
    );
    const result = await llm.structuredOutput<DreamCreateExtraction>({
      systemPrompts: [SYSTEM_PROMPT],
      messages: [
        {
          role: "user",
          content: `User said:\n"""\n${input.userMessage}\n"""\n\nTilly replied:\n"""\n${input.tillyReply}\n"""`,
        },
      ],
      schema: ExtractSchema,
      schemaName: "DreamCreateExtraction",
      maxTokens: 256,
      meta: { route: "tilly:extract-dream", userId: input.meta?.userId ?? null },
    });
    if (!result.shouldCreate) return null;
    if (!result.name || result.name.trim().length === 0) return null;
    if (result.targetAmount <= 0) return null;
    return result;
  } catch (err) {
    console.warn(
      "[extract-dream] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
