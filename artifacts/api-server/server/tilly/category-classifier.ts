/**
 * Plaid-transaction category classifier.
 *
 * For freshly-synced Plaid rows where we don't yet have a learned merchant
 * rule AND Plaid's own mapping landed on "other", call a fast LLM (Haiku via
 * OpenRouter) and ask: what category + tags should this be, and how
 * confident are you?
 *
 * The result is stored in plaid_transactions.ai_suggested_* and surfaced in
 * the Pending screen as "Tilly thinks: dining" with one-tap confirm. If the
 * user disagrees we log the override to ai_corrections so we can tune the
 * prompt later.
 *
 * Cache: per (couple, merchantSignature) — a household's local pizza place
 * gets classified once, not on every weekly sync. Cleared automatically
 * when the user creates a merchant_rules row (see merchant-rules.ts).
 */
import { z } from "zod";
import { OpenRouterLLM } from "./llm/openrouter";

/**
 * The 13 internal ExpenseCategory values — kept in sync with mapPlaidCategory
 * in server/plaid.ts. Tilly's classifier MUST return one of these so the
 * spend page renders consistently. Anything weird (income, transfer) returns
 * "other" — the auto-accept filter rejects those upstream anyway.
 */
const ALLOWED_CATEGORIES = [
  "groceries",
  "restaurants",
  "transport",
  "entertainment",
  "utilities",
  "subscriptions",
  "shopping",
  "health",
  "personal",
  "education",
  "kids",
  "travel",
  // Real spend buckets that LOAN_PAYMENTS / BANK_FEES used to fall into
  // "other" for. Surfacing them as their own categories is what makes
  // Tilly feel like she's actually reading your statement, not just
  // shrugging at half the rows.
  "loans",
  "fees",
  "other",
] as const;

const CategorySchema = z.object({
  category: z
    .enum(ALLOWED_CATEGORIES)
    .describe("Best-fit internal category. Use 'other' if unsure."),
  tags: z
    .array(z.string())
    .describe(
      "0-3 short lowercase tags that further qualify the merchant " +
        "(e.g. ['coffee'], ['rideshare'], ['streaming']). Empty array if none apply.",
    ),
  confidence: z
    .number()
    .describe(
      "0..1. 1 = certain (well-known national merchant). 0.5 = guessing from " +
        "merchant string alone. Below 0.7 the user will be asked to confirm.",
    ),
  reasoning: z
    .string()
    .describe("One short sentence explaining the decision."),
});

export type ClassifierResult = z.infer<typeof CategorySchema>;

const SYSTEM_PROMPT = `You are Tilly, a personal-finance categorizer for a Canadian student app (beachhead: Laurier, Waterloo). Given a single bank transaction, return exactly one of the allowed categories, 0-3 short tags, a confidence score, and a one-sentence reason that the UI will show the user as "Tilly thinks: <reason>".

Categories:
- groceries, restaurants, transport, entertainment, utilities, subscriptions, shopping, health, personal, education, kids, travel, loans, fees, other.

How to choose:
- "loans" = car loans (LOAN_PAYMENTS_CAR_PAYMENT), student loans (OSAP, Nelnet), credit-card pay-downs (LOAN_PAYMENTS_CREDIT_CARD_PAYMENT), mortgage. The user wants to SEE these in their categorization, not bury them.
- "fees" = bank fees, account fees, NSF, ATM fees, annual card fees (BANK_FEES). Small individually but the user notices them.
- "transport" = gas, transit (Presto, MTA, TTC), rideshare (Uber, Lyft), parking. NOT car-loan payments — those are "loans".
- "subscriptions" = recurring monthly software/streaming (Netflix, Spotify, ChatGPT, Adobe). NOT one-off SaaS purchases — those are "shopping".
- "utilities" = rent, hydro, water, internet, phone bill.
- "education" = tuition, textbooks, course fees, school-aligned merchants (campus bookstore, university branded merch).
- "other" is genuinely last-resort: only when you cannot pick a real category. Transfers between the user's own accounts are "other" (they're not spending). Income (paycheck deposits) is "other" — we filter income out separately.

Confidence:
- 0.9+ only for well-known merchants (Spotify, Tim Hortons, Uber, Loblaws) OR when Plaid's PFC is unambiguous (LOAN_PAYMENTS_CAR_PAYMENT → loans, 0.95).
- 0.7-0.8 for plausible local merchants ("Frank Bistro" → restaurants).
- Below 0.7 when even a plausible category is a stretch — the user will be asked to confirm.

Reasoning: write one short user-facing sentence the UI can show. Examples:
- "monthly Lincoln auto-finance payment — looks like a car loan"
- "TD account fee — annual card fee"
- "Tim Hortons drive-thru — coffee + bagel run"
Don't say "I think" or "this appears to be" — the UI already shows "Tilly thinks". Just describe it directly.

Tags: 0-3 short lowercase: ["coffee"], ["rideshare"], ["streaming"], ["car-loan"], ["osap"], ["annual-fee"]. Don't repeat the category as a tag.`;

const cache = new Map<string, ClassifierResult>();

function cacheKey(coupleId: string, signature: string): string {
  return `${coupleId}::${signature}`;
}

export function clearClassifierCache(coupleId: string, signature: string): void {
  cache.delete(cacheKey(coupleId, signature));
}

export type ClassifierInput = {
  coupleId: string;
  signature: string;
  merchant: string;
  amount: number;
  plaidLegacyCategory?: string[] | null;
  pfCategory?: { primary?: string | null; detailed?: string | null } | null;
};

/**
 * Classify a transaction. Returns null when the LLM call fails so the caller
 * can fall back to Plaid's mapping without breaking the sync. Logs the call
 * to ai_logs implicitly via OpenRouterLLM.recordLLMCall.
 *
 * The model is intentionally fixed to Haiku here — categorization doesn't
 * need Sonnet/Opus reasoning, and the per-sync token cost adds up across
 * thousands of rows. Override via TILLY_CLASSIFIER_MODEL env if needed.
 */
export async function classifyTransaction(
  input: ClassifierInput,
): Promise<ClassifierResult | null> {
  const key = cacheKey(input.coupleId, input.signature);
  const cached = cache.get(key);
  if (cached) return cached;

  const model = process.env.TILLY_CLASSIFIER_MODEL || "anthropic/claude-haiku-4.5";
  const llm = new OpenRouterLLM(model);

  const userMessage = [
    `Merchant: ${input.merchant || "(unknown)"}`,
    `Amount: $${Math.abs(input.amount).toFixed(2)}`,
    input.plaidLegacyCategory && input.plaidLegacyCategory.length
      ? `Plaid hierarchy: ${input.plaidLegacyCategory.join(" > ")}`
      : null,
    input.pfCategory?.primary
      ? `Plaid PFC: ${input.pfCategory.primary}${input.pfCategory.detailed ? " / " + input.pfCategory.detailed : ""}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await llm.structuredOutput<ClassifierResult>({
      systemPrompts: [SYSTEM_PROMPT],
      messages: [{ role: "user", content: userMessage }],
      schema: CategorySchema,
      schemaName: "TillyCategoryClassification",
      maxTokens: 256,
      meta: { route: "tilly:category-classifier", userId: null },
    });
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn(
      `[category-classifier] failed for ${input.merchant}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export const HIGH_CONFIDENCE_THRESHOLD = 0.7;
