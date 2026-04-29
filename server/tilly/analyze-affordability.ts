/**
 * Affordability analysis — spec §4.2 chat + §5.6 quick-math card.
 *
 * Routes through the configured LLMClient (default OpenRouter →
 * anthropic/claude-opus-4). The persona+tone prompts get assembled by
 * `buildSystemPrompts` so admin overrides propagate live.
 *
 * Output shape is enforced by Zod via `LLMClient.structuredOutput`.
 */
import { z } from "zod";

import { getLLM } from "./llm/factory";
import { buildSystemPrompts } from "./persona";
import type { BTToneKey } from "./tone";

// ─── Schema (Zod) ──────────────────────────────────────────────────────────

const AnalysisRowSchema = z.object({
  label: z.string().describe("Short label for this ledger line, e.g. 'Concert ticket'."),
  amt: z
    .number()
    .describe(
      "Signed amount in dollars. Positive for inflows/buffer, negative for deductions, final-buffer is the closing positive number.",
    ),
  sign: z
    .enum(["+", "-", "="])
    .describe("'+' for starting buffer / inflows, '-' for deductions, '=' for final buffer."),
});

export const AffordabilityAnalysisSchema = z.object({
  kind: z.literal("analysis").describe("Always the literal string 'analysis'."),
  title: z
    .string()
    .describe(
      "Always 'Quick math' unless the situation calls for a more specific framing.",
    ),
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
    .nullable()
    .describe(
      "Optional one-line concrete action the student can take. null if no follow-up needed.",
    ),
});

export type AffordabilityRow = z.infer<typeof AnalysisRowSchema>;
export type AffordabilityAnalysis = z.infer<typeof AffordabilityAnalysisSchema>;

// ─── Input shape ───────────────────────────────────────────────────────────

export type AffordabilityInput = {
  userMessage: string;
  ledger: {
    balance: number;
    upcomingBills: { label: string; amount: number; dueLabel: string }[];
    nextPaycheck?: { amount: number; dayLabel: string };
    activeDreamAutoSaves: { name: string; weekly: number }[];
  };
  /** Plain-text summary of the student's actual financial state — fed
   *  into the model so "Starting buffer" reflects reality instead of 0. */
  stateSummary?: string | null;
  tone: BTToneKey;
  recentMemorySnippets: string[];
};

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

export async function analyzeAffordability(
  input: AffordabilityInput,
): Promise<AffordabilityAnalysis> {
  const memContext = input.recentMemorySnippets.length
    ? `\n\nWhat you remember about them (in your own voice):\n${input.recentMemorySnippets.map((s) => `- ${s}`).join("\n")}`
    : "";

  const stateBlock = input.stateSummary
    ? `\n\nTheir current financial state (use this when computing the ledger — DO NOT say you can't see their balance):\n${input.stateSummary}`
    : "";

  const userContent = `The student just asked: "${input.userMessage}"

Their ledger right now:
${formatLedger(input.ledger)}${stateBlock}${memContext}

Compute the affordability ledger and return the structured analysis. Show your math first (3-5 rows: starting buffer -> deductions -> final buffer), then give the call in 1-2 sentences in your voice. Use the active tone. The 'note' must lead with a clear yes/no and explain the tradeoff in plain language. Use ASCII chars only in labels and notes (no em-dashes, no smart quotes).`;

  const systemPrompts = await buildSystemPrompts(input.tone);
  const llm = await getLLM();

  return llm.structuredOutput<AffordabilityAnalysis>({
    systemPrompts,
    messages: [{ role: "user", content: userContent }],
    schema: AffordabilityAnalysisSchema,
    schemaName: "affordability_analysis",
  });
}
