/**
 * LLMClient — provider-agnostic interface for Tilly's LLM calls.
 *
 * Two contracts:
 *   - `textReply(opts)`           → free-form text generation (chat replies, brief copy)
 *   - `structuredOutput(opts, schema)` → JSON-schema-validated structured output
 *                                          (analysis cards, memory extraction, etc.)
 *
 * Implementations live in `./openrouter.ts` (default) and (future)
 * `./anthropic-direct.ts`. The factory in `./factory.ts` chooses which
 * impl to return based on `tilly_config.provider`.
 *
 * `systemPrompts` is an array of system blocks. Implementations decide
 * whether to cache the first block (Anthropic) or concatenate them into
 * a single system message (OpenAI / OpenRouter).
 */
import type { ZodType } from "zod";

export type Role = "user" | "assistant";

export type ChatMessage = {
  role: Role;
  content: string;
};

export type LLMTextOpts = {
  systemPrompts: string[];
  messages: ChatMessage[];
  maxTokens?: number;
  /** Provider-specific extras forwarded as-is (e.g. `temperature` on legacy models). */
  extra?: Record<string, unknown>;
};

export type LLMStructuredOpts<T> = LLMTextOpts & {
  schema: ZodType<T>;
  schemaName: string;
  /**
   * Description of what to produce — surfaced to the model as a system hint
   * if the provider supports it. OpenAI's structured outputs use the schema
   * description; Anthropic's accept it as part of the schema metadata.
   */
  schemaDescription?: string;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type LLMTextResult = {
  text: string;
  usage: LLMUsage;
  modelId: string;
};

export interface LLMClient {
  readonly providerName: string;
  readonly modelId: string;
  textReply(opts: LLMTextOpts): Promise<LLMTextResult>;
  structuredOutput<T>(opts: LLMStructuredOpts<T>): Promise<T>;
}

/**
 * Tilly's default per-provider model picks. `tilly_config.model` overrides
 * these for a deployment; admins use the /admin/tilly page to swap.
 */
export const DEFAULT_MODELS = {
  openrouter: {
    // Sonnet 4.6 is ~3x faster than Opus on chat + vision and Tilly's
    // tone holds up well. Receipt OCR + the "is this affordable" math
    // blocks both fit comfortably inside Sonnet. Swap back to Opus only
    // if a specific user reports tone regression.
    chat: "anthropic/claude-sonnet-4.6",
    embedding: "openai/text-embedding-3-small",
  },
  anthropic: {
    chat: "claude-sonnet-4-6",  // anthropic-direct uses hyphens, OpenRouter uses dots
    // Anthropic doesn't host embeddings — fall back to OpenRouter for embeds
    // even on anthropic-direct provider, or use Voyage AI separately.
    embedding: "openai/text-embedding-3-small",
  },
} as const;
