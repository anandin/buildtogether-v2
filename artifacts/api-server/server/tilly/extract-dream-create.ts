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

const SYSTEM_PROMPT = `You are a precise tool-call extractor. Decide whether THE USER's message in this turn is an explicit request to create a savings goal (a "dream"), and extract the parameters.

THE ONLY THING THAT DETERMINES shouldCreate IS THE USER'S MESSAGE. Ignore Tilly's reply when judging shouldCreate — the reply is shown only to help you understand context. Tilly may say "already done" or "I set this up earlier" because of unrelated chat history; that does NOT mean the dream actually exists. If the user just asked, fire the tool. The system handles deduplication.

shouldCreate = true when the USER's message contains a clear creation request, e.g.:
- "create a dream for X"
- "create a dream to track the Switch 2"
- "set up a goal for Y"
- "save for Z" (with a clear thing-to-save-for)
- "track Y at \$N/month"
- "add a dream for X"
- "I want to save \$N for Z"

shouldCreate = false ONLY when:
- The user is asking a question ABOUT existing dreams ("how is my Barcelona dream doing?")
- The user is describing a future purchase casually ("I might get an iPad someday")
- Tilly suggested a dream and the user hasn't responded with agreement yet
- The user's message has no goal-creation language at all

Parameter extraction (only when shouldCreate=true):
- name: short title, cleaned of "$" amounts. e.g. "Switch 2", "Barcelona trip", "AirPods Pro"
- targetAmount: explicit dollar number if mentioned. Otherwise estimate from real-world prices (Switch 2 ≈ \$650, MacBook Air ≈ \$1500, Barcelona trip ≈ \$2000, AirPods ≈ \$250). Never 0 if shouldCreate=true.
- monthlyContribution: only if the user mentioned one ("\$130/mo", "save 50 a month"). Otherwise 0.
- emoji: meaningful icon (🎮 game, 🏖️ vacation, 🚗 car, 📱 phone, 💍 ring, 💻 laptop, 🎧 audio). Default ✺ if uncertain.

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
