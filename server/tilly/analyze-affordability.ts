/**
 * Affordability analysis — spec §4.2 chat + §5.6 quick-math card.
 *
 * When a student asks "can I afford X this weekend?", Tilly returns a
 * structured `analysis` message:
 *
 *   {
 *     kind: "analysis",
 *     title: "Quick math",
 *     rows: [
 *       { label: "Available Fri after rent", amt:  412.58, sign: "+" },
 *       { label: "Concert ticket",           amt:  -90.00, sign: "-" },
 *       { label: "Buffer left",              amt:  322.58, sign: "=" },
 *     ],
 *     note: "Honestly? Yes — but only because you skipped takeout twice this
 *            week. Want me to move it from your spending money, not from
 *            Barcelona?"
 *   }
 *
 * This is the format that earns trust: math first, judgment second. The
 * student sees Tilly's reasoning, not just her conclusion.
 *
 * Implementation uses Anthropic's structured outputs (`messages.parse()` +
 * `zodOutputFormat`) — Claude is constrained to emit JSON matching the
 * schema, which `parsed_output` returns as a typed object. The persona +
 * tone system blocks ride along on every call (persona is cached).
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

// ─── Schema (Zod) ──────────────────────────────────────────────────────────

const AnalysisRowSchema = z.object({
  label: z.string().describe("Short label for this ledger line, e.g. 'Concert ticket'."),
  amt: z
    .number()
    .describe("Signed amount in dollars. Positive for inflows/buffer, negative for deductions, final-buffer is the closing positive number."),
  sign: z
    .enum(["+", "-", "="])
    .describe("'+' for starting buffer / inflows, '-' for deductions, '=' for final buffer."),
});

export const AffordabilityAnalysisSchema = z.object({
  kind: z.literal("analysis").describe("Always the literal string 'analysis'."),
  title: z
    .string()
    .describe("Always 'Quick math' unless the situation calls for a more specific framing."),
  rows: z
    .array(AnalysisRowSchema)
    .describe(
      "3–5 ledger lines. Order: starting buffer first (sign '+'), then deductions (sign '-'), then final buffer last (sign '=').",
    ),
  note: z
    .string()
    .describe(
      "1–2 short sentences in Tilly's voice with the actual call. Lead with 'Yes' or 'No', explain the why, optionally offer a tradeoff move (e.g. 'Want me to move it from your spending money, not from Barcelona?'). NEVER use emoji.",
    ),
  followUp: z
    .string()
    .optional()
    .describe(
      "Optional one-line concrete action the student can take. Empty if no follow-up needed.",
    ),
});

export type AffordabilityRow = z.infer<typeof AnalysisRowSchema>;
export type AffordabilityAnalysis = z.infer<typeof AffordabilityAnalysisSchema>;

// ─── Input shape ───────────────────────────────────────────────────────────

export type AffordabilityInput = {
  /** What the student is asking about, in their own words. */
  userMessage: string;
  /** Live ledger snapshot at moment of question. */
  ledger: {
    balance: number;
    upcomingBills: { label: string; amount: number; dueLabel: string }[];
    nextPaycheck?: { amount: number; dayLabel: string };
    activeDreamAutoSaves: { name: string; weekly: number }[];
  };
  tone: BTToneKey;
  /**
   * Recent memory snippets in Tilly's voice (1st-person), e.g. ["You skipped
   * DoorDash twice this week.", "You named 'Barcelona' a dream."]. Tilly may
   * weave these into the `note`.
   */
  recentMemorySnippets: string[];
};

// ─── Implementation ────────────────────────────────────────────────────────

/**
 * Format the ledger snapshot as a compact context block — Claude sees this
 * as part of the user message so it can compute the math without running
 * code. Numbers are pre-rounded to 2dp.
 */
function formatLedger(ledger: AffordabilityInput["ledger"]): string {
  const lines: string[] = [];
  lines.push(`Current balance: $${ledger.balance.toFixed(2)}`);
  if (ledger.upcomingBills.length) {
    lines.push("Upcoming bills:");
    for (const b of ledger.upcomingBills) {
      lines.push(`  - ${b.label}: -$${b.amount.toFixed(2)} (${b.dueLabel})`);
    }
  }
  if (ledger.nextPaycheck) {
    lines.push(
      `Next paycheck: +$${ledger.nextPaycheck.amount.toFixed(2)} (${ledger.nextPaycheck.dayLabel})`,
    );
  }
  if (ledger.activeDreamAutoSaves.length) {
    lines.push("Active dream auto-saves (already counted as spoken-for):");
    for (const d of ledger.activeDreamAutoSaves) {
      lines.push(`  - ${d.name}: $${d.weekly.toFixed(2)}/week`);
    }
  }
  return lines.join("\n");
}

/**
 * Run an affordability analysis. Returns the structured card the chat UI
 * renders directly.
 *
 * Throws if the model returns malformed output (Zod validation fails) — the
 * caller should fall back to a plain-text "let me think on that" reply.
 */
export async function analyzeAffordability(
  input: AffordabilityInput,
): Promise<AffordabilityAnalysis> {
  const memoryContext = input.recentMemorySnippets.length
    ? `\n\nWhat you remember about them (in your own voice):\n${input.recentMemorySnippets.map((s) => `- ${s}`).join("\n")}`
    : "";

  const userContent = `The student just asked: "${input.userMessage}"

Their ledger right now:
${formatLedger(input.ledger)}${memoryContext}

Compute the affordability ledger and return the structured analysis. Show your math first (3–5 rows: starting buffer → deductions → final buffer), then give the call in 1–2 sentences in your voice. Use the active tone. The 'note' must lead with a clear yes/no and explain the tradeoff in plain language.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const response = await tilly().messages.parse({
    model: TILLY_MODEL,
    max_tokens: TILLY_DEFAULT_MAX_TOKENS,
    thinking: { type: "adaptive" },
    system: [personaSystemBlock(), toneSystemBlock(input.tone)],
    messages,
    output_config: {
      format: zodOutputFormat(AffordabilityAnalysisSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `analyzeAffordability: model returned no parseable output (stop_reason=${response.stop_reason})`,
    );
  }

  return response.parsed_output;
}
