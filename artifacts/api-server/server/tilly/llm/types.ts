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
  /**
   * Cost-tracking attribution. Plumbed by callers so the LLM client can
   * record one row per call into `tilly_llm_call_log` (admin Cost tab).
   * `userId` is nullable for cron / system calls that have no end-user.
   * `route` is the logical caller name (chat | analyse | dossier | …).
   * Omitted by callers that don't yet plumb it; logged as route="unknown".
   */
  meta?: { userId?: string | null; route: string };
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
  /** Optional. When present, supports the OpenAI-compatible `tools` param —
   * a single LLM call that may emit assistant text, tool_calls, or both.
   * Drives runWithTools() in `./tool-loop.ts`. Providers that don't
   * implement this fall back to the post-extractor pattern. */
  toolReply?(opts: LLMToolReplyOpts): Promise<LLMToolReplyResult>;
}

// ─── Tool-use types (OpenAI-compatible function calling) ────────────────

export type LLMToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. Tools must keep this in sync
   * with their server-side zod validation; mismatch yields silent no-ops
   * because the dispatcher re-validates. */
  parameters: Record<string, unknown>;
};

export type LLMToolCall = {
  /** Provider-issued id; must be echoed back as `tool_call_id` on the
   * `role:"tool"` turn that returns the result. */
  id: string;
  name: string;
  /** Raw JSON string as emitted by the model. Caller parses + validates. */
  arguments: string;
};

/** A single conversation turn rich enough for the tool loop. Plain
 * `user` / `assistant` carry text; `assistant` may also include
 * `tool_calls`; `tool` carries a result indexed by `tool_call_id`. */
export type LLMTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: LLMToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LLMToolReplyOpts = {
  systemPrompts: string[];
  turns: LLMTurn[];
  tools: LLMToolDef[];
  /** Default "auto" — the model decides. "required" forces a tool call
   * (rarely useful here). "none" suppresses tools (debug). */
  toolChoice?: "auto" | "required" | "none";
  maxTokens?: number;
  meta?: { userId?: string | null; route: string };
};

export type LLMToolReplyResult = {
  /** May be empty string when the model emitted tool_calls only. */
  text: string;
  /** Empty when no tools were called this turn. */
  toolCalls: LLMToolCall[];
  modelId: string;
  usage: LLMUsage;
};

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
