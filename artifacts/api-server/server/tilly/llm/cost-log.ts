/**
 * LLM cost log — every textReply / structuredOutput / embed call writes one
 * row into `tilly_llm_call_log` so the /admin Cost tab can show per-user $
 * totals + per-route breakdowns.
 *
 * Pricing is hard-coded per model (USD per 1M tokens) for the models we
 * actually call. Unknown models log with cost=0 — the row still lands so
 * we can spot-check token usage and add a price entry later.
 *
 * IMPORTANT: this module is fire-and-forget. `recordLLMCall` never throws
 * and never blocks the caller — telemetry must never break a user reply.
 */
import { db } from "../../db";
import { tillyLlmCallLog } from "../../../shared/schema";

/** USD per 1,000,000 tokens. `embed` is per-input-token only. */
type Price = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

const MODEL_PRICES: Record<string, Price> = {
  // Anthropic via OpenRouter (dot-style model ids)
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "anthropic/claude-sonnet-4.5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "anthropic/claude-opus-4": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // Anthropic native (hyphen-style model ids)
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  // Google via OpenRouter
  "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
  // OpenAI embeddings via OpenRouter (output is always 0 — input-only billing)
  "openai/text-embedding-3-small": { input: 0.02, output: 0 },
  "openai/text-embedding-3-large": { input: 0.13, output: 0 },
  // OpenAI chat fallbacks
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
};

/**
 * Look up the price row for a model. Tries the exact id first, then a
 * lower-cased variant. Returns null when the model is unknown — the
 * caller logs the row with cost=0.
 */
function priceFor(model: string): Price | null {
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];
  const lower = model.toLowerCase();
  if (MODEL_PRICES[lower]) return MODEL_PRICES[lower];
  return null;
}

export type RecordLLMCallInput = {
  userId?: string | null;
  route: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
};

/**
 * Compute USD cost from token counts using MODEL_PRICES. Defaults missing
 * cache prices to the regular input price so a model with prompt-cache
 * support never logs $0 just because we forgot to add cacheRead.
 */
export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const p = priceFor(model);
  if (!p) return 0;
  // Billing contract: providers report `input_tokens` as the *non-cached*
  // prompt portion, with cache reads/writes broken out separately. This
  // matches Anthropic Messages API and OpenAI Responses API as of 2025.
  // We therefore bill all three buckets additively without subtraction —
  // if a future provider folds cache reads into `input_tokens`, swap to
  // `Math.max(0, promptTokens - cacheReadTokens)` here.
  const billedInput = Math.max(0, promptTokens);
  const cacheReadPrice = p.cacheRead ?? p.input;
  const cacheWritePrice = p.cacheWrite ?? p.input;
  return (
    (billedInput * p.input) / 1_000_000 +
    (completionTokens * p.output) / 1_000_000 +
    (cacheReadTokens * cacheReadPrice) / 1_000_000 +
    (cacheWriteTokens * cacheWritePrice) / 1_000_000
  );
}

/**
 * Insert one row into tilly_llm_call_log. Fire-and-forget — swallows
 * every error so a flaky DB connection during telemetry never poisons
 * the surrounding LLM call.
 */
export function recordLLMCall(input: RecordLLMCallInput): void {
  // Don't block the caller. We intentionally do not await this anywhere.
  void (async () => {
    try {
      const promptTokens = input.promptTokens ?? 0;
      const completionTokens = input.completionTokens ?? 0;
      const cacheReadTokens = input.cacheReadTokens ?? 0;
      const cacheWriteTokens = input.cacheWriteTokens ?? 0;
      const costUsd = estimateCostUsd(
        input.model,
        promptTokens,
        completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
      );
      await db.insert(tillyLlmCallLog).values({
        userId: input.userId ?? null,
        route: input.route || "unknown",
        provider: input.provider,
        model: input.model,
        promptTokens,
        completionTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costUsd,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        ok: input.ok,
        error: input.error ? String(input.error).slice(0, 2000) : null,
      });
    } catch (err) {
      // Telemetry must never break a user-facing call.
      console.warn("[cost-log] recordLLMCall failed:", err);
    }
  })();
}

/** Exposed for the admin Cost tab so it can show the same prices in the UI. */
export function getModelPriceTable(): Record<string, Price> {
  return MODEL_PRICES;
}
