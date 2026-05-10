/**
 * Unified tool-call extractor.
 *
 * Single Haiku pass after Tilly's main reply. Returns the array of tools
 * the user just asked her to take in this turn. Each detected call goes
 * through the dispatcher (registry.executeTool) which validates args
 * server-side and runs the side effect.
 *
 * Why one extractor instead of one-per-tool: the per-tool approach was
 * getting expensive (N Haiku calls per chat turn, each with a tightly
 * scoped prompt that doesn't share work). One pass with the full registry
 * is cheaper, more consistent, and aligned with how Anthropic's native
 * tool_use blocks return arrays. When we migrate to true function-calling
 * (Phase 3), this file's role becomes "the prompt that lists available
 * tools" which is exactly what `tools` in the OpenRouter request expects.
 */
import { z } from "zod";
import { OpenRouterLLM } from "../llm/openrouter";

// Args schema lists every field used by ANY tool, all optional. Why not a
// discriminated union: OpenRouter's JSON Schema serializer empirically
// drops nested-union args (Claude returns args:{}). With every field
// enumerated optional, Claude fills the relevant ones for each tool name.
// Per-tool strict validation still runs in the dispatcher, so unrelated
// fields aren't a correctness risk.
const ToolArgsSchema = z.object({
  // createDream
  name: z.string().optional(),
  targetAmount: z.number().optional(),
  monthlyContribution: z.number().optional(),
  emoji: z.string().optional(),
  // markPaymentToOwnCard
  merchantSignature: z.string().optional(),
  cardName: z.string().optional(),
  // hideCategoryFromSpend
  category: z.string().optional(),
  // pinToHome
  tileKind: z.string().optional(),
  // setOnboardingField
  field: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  // Cross-tool
  reason: z.string().optional(),
});

const ToolCallSchema = z.object({
  name: z.enum([
    "createDream",
    "markPaymentToOwnCard",
    "hideCategoryFromSpend",
    "pinToHome",
    "setOnboardingField",
  ]),
  args: ToolArgsSchema,
});

const ResultSchema = z.object({
  toolCalls: z
    .array(ToolCallSchema)
    .describe(
      "Zero or more tool calls the user JUST asked Tilly to perform in THIS turn. Empty array when the user is just chatting / asking questions.",
    ),
});

export type ExtractedToolCall = z.infer<typeof ToolCallSchema>;

const SYSTEM_PROMPT = `You are a precise tool-call extractor for a personal-finance app called Tilly.

Given the user's most recent message and Tilly's reply, decide which tools (if any) the USER explicitly asked Tilly to take this turn. Return an array of {name, args} objects. Empty array when the user is just chatting, asking questions, or describing things without requesting an action.

THE USER'S MESSAGE IS THE PRIMARY SIGNAL. Tilly's reply is provided for context; even when she says "Done" or "I'll handle it", that does NOT mean the action happened — those are hallucinations the system catches via this extractor. Don't be swayed.

Available tools:

1. createDream — when the user asks to create / set up / track a savings goal.
   Triggers: "create a dream for X", "set up a goal", "save for Z", "track Y at \$N/month"
   Args: { name: string, targetAmount: number, monthlyContribution?: number, emoji?: string }
   Estimate targetAmount from real-world prices when not given (Switch 2 ≈ 650, MacBook ≈ 1500, Barcelona ≈ 2000).

2. markPaymentToOwnCard — when the user clarifies that a transaction Tilly was treating as a "loan" or expense is actually them paying off their own credit card balance (which they've also synced as a separate account).
   Triggers: "scotia under loans is my credit card bill", "that visa payment is my own card", "I synced my X card so stop counting", "scotia is my credit card", "that's a payment to my own card".
   Args: { merchantSignature: string (lowercased, e.g. "scotialn vsa"), cardName: string ("Scotia VISA"), reason?: string }
   Use the merchant string the user pointed at, lowercased + simplified (drop store numbers, dates).

3. hideCategoryFromSpend — when the user wants Tilly to stop showing a spend category on the Spend screen.
   Triggers: "hide loans from my spend page", "stop showing me X", "I don't want to see Y in my breakdown".
   Args: { category: string (one of: groceries, restaurants, transport, entertainment, utilities, subscriptions, shopping, health, personal, education, kids, travel, loans, fees, taxes, transfers, other), reason?: string }

4. pinToHome — when the user wants Tilly to add a tile to the Today (home) screen.
   Triggers: "show my subscriptions on home", "pin credit health to today", "add my upcoming bills to the front page".
   Args: { tileKind: string (one of: subscriptions_overview, credit_health, spending_vs_avg, upcoming_bills, debt_breakdown) }

5. setOnboardingField — when the user tells Tilly something about themselves that maps to a known onboarding field.
   Triggers: "I'm 38", "I support 4 people", "I live in Toronto", "I'm salaried", "I go to Laurier".
   Args: { field: one of [employmentType, ageBand, city, dependents, supportNote, schoolName], value: string | number }
   Field mappings:
   - employmentType: "salaried" | "student" | "self-employed" | "freelance" | "unemployed" | "retired"
   - ageBand: "under-18" | "18-24" | "25-34" | "35-44" | "45+"
   - city: free-form string
   - dependents: number (people user supports — kids, parents, partners, etc.)
   - supportNote: free-form clarification
   - schoolName: name of school (only when employmentType=student)
   Fire MULTIPLE setOnboardingField calls in the array if the user mentions multiple fields ("I'm 38, support 4, in Toronto" → 3 calls).

Output rules:
- toolCalls = [] is fine (and common). Don't force a tool when none applies.
- Each {name, args} entry must be one of the five tools above.
- Args must match the shapes described — but be lenient: include only fields you're confident about. Validation runs server-side; bad args yield a no-op.
- DO NOT fire tools the user is just asking ABOUT (e.g. "what is a dream?" → []).
- DO NOT fire createDream when Tilly suggested something the user hasn't agreed to.

Output the structured fields. No prose.`;

/**
 * Extract zero or more tool calls. Returns [] on any failure (treat as
 * no-tool turn rather than blowing up the chat reply).
 */
export async function extractToolCalls(input: {
  userMessage: string;
  tillyReply: string;
  meta?: { userId?: string | null };
}): Promise<ExtractedToolCall[]> {
  try {
    const llm = new OpenRouterLLM(
      process.env.TILLY_TOOL_EXTRACTOR_MODEL || "anthropic/claude-haiku-4.5",
    );
    const result = await llm.structuredOutput<{ toolCalls: ExtractedToolCall[] }>({
      systemPrompts: [SYSTEM_PROMPT],
      messages: [
        {
          role: "user",
          content: `USER said:\n"""\n${input.userMessage}\n"""\n\nTILLY replied:\n"""\n${input.tillyReply}\n"""`,
        },
      ],
      schema: ResultSchema,
      schemaName: "TillyToolCalls",
      maxTokens: 512,
      meta: { route: "tilly:tool-extractor", userId: input.meta?.userId ?? null },
    });
    return Array.isArray(result?.toolCalls) ? result.toolCalls : [];
  } catch (err) {
    console.warn(
      "[tools/extractor] failed:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
