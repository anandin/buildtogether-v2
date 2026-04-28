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
 * Phase 2 wires this to:
 *   - Claude with a tool-use schema enforcing the rows[] shape
 *   - Live ledger context: balance, upcoming bills, paycheck date, dream auto-saves
 *   - The student's tone preference (only changes the `note`, not the math)
 *   - Memory writer: extracts the affordability question + Tilly's call, writes to tilly_memory
 */
import type { BTToneKey } from "./tone";

export type AnalysisRow = {
  label: string;
  amt: number;
  sign: "+" | "-" | "=";
};

export type AffordabilityAnalysis = {
  kind: "analysis";
  title: string;
  rows: AnalysisRow[];
  note: string;
  followUp?: string; // optional: "set a $30 ceiling on Friday night food"
};

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
  /** Tone preference. */
  tone: BTToneKey;
  /** Recent memories Tilly should weave in if relevant. */
  recentMemorySnippets: string[];
};

/**
 * Phase 2 implementation calls Claude with `tools` to coerce the structured
 * shape, then unwraps the tool_use block. For Phase 1 this returns a stub
 * the routes can compile against.
 */
export async function analyzeAffordability(
  _input: AffordabilityInput,
): Promise<AffordabilityAnalysis> {
  throw new Error("Phase 2: analyzeAffordability not yet implemented");
}
