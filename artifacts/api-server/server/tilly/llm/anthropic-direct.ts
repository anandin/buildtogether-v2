/**
 * Native Anthropic LLM client — uses @anthropic-ai/sdk against the official
 * Anthropic API (not via OpenRouter).
 *
 * When to choose this over OpenRouterLLM:
 *   - Lower latency (one less hop).
 *   - Direct billing on the Anthropic account (e.g. for enterprise pricing).
 *   - Access to provider-only features like prompt caching with explicit
 *     cache_control blocks.
 *
 * Selected when `tilly_config.provider = "anthropic"`. Requires
 * `ANTHROPIC_API_KEY` to be set; throws on first use otherwise.
 *
 * Structured output: Anthropic doesn't expose OpenAI-style
 * `response_format: json_schema`, so we use tool-use as a structured-output
 * channel — the model is asked to call a single tool whose input_schema is
 * the requested JSON Schema, and we read the tool_use block's input.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

import type {
  LLMClient,
  LLMTextOpts,
  LLMTextResult,
  LLMStructuredOpts,
} from "./types";
import { DEFAULT_MODELS } from "./types";
import { recordLLMCall } from "./cost-log";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — switch Tilly provider to 'openrouter' " +
        "in /admin/tilly or add the secret to use the native Anthropic SDK.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * zod-to-json-schema bridge. Anthropic's tool input_schema is a plain
 * JSON Schema object, so we reuse the same lib OpenRouterLLM uses.
 * Hand-written fallback covers the case where the lib isn't installed
 * (it ships with Zod ^3.24+ in this monorepo, so the require should win).
 */
function zodToJsonSchemaSafe(schema: ZodType, name: string): Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("zod-to-json-schema");
    const ztjs = mod.zodToJsonSchema || mod.default;
    if (ztjs) {
      const json = ztjs(schema, { name, $refStrategy: "none" }) as Record<string, unknown>;
      let body: Record<string, unknown> = json;
      if ((json as any).definitions && (json as any).definitions[name]) {
        body = (json as any).definitions[name] as Record<string, unknown>;
      }
      return body;
    }
  } catch {
    // fall through
  }
  return { type: "object" };
}

export class AnthropicDirectLLM implements LLMClient {
  readonly providerName = "anthropic";
  readonly modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? DEFAULT_MODELS.anthropic.chat;
  }

  /** System blocks join with `---` separators — same convention OpenRouterLLM uses. */
  private buildSystem(opts: LLMTextOpts): string {
    return opts.systemPrompts.filter(Boolean).join("\n\n---\n\n");
  }

  private buildMessages(opts: LLMTextOpts): Array<{ role: "user" | "assistant"; content: string }> {
    return opts.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async textReply(opts: LLMTextOpts): Promise<LLMTextResult> {
    const t0 = Date.now();
    try {
      const resp = await client().messages.create({
        model: this.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        system: this.buildSystem(opts),
        messages: this.buildMessages(opts),
      });
      const text = resp.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      const cacheRead = (resp.usage as any)?.cache_read_input_tokens ?? 0;
      const cacheWrite = (resp.usage as any)?.cache_creation_input_tokens ?? 0;
      recordLLMCall({
        userId: opts.meta?.userId ?? null,
        route: opts.meta?.route ?? "unknown",
        provider: this.providerName,
        model: this.modelId,
        promptTokens: resp.usage?.input_tokens ?? 0,
        completionTokens: resp.usage?.output_tokens ?? 0,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        latencyMs: Date.now() - t0,
        ok: true,
      });
      return {
        text,
        modelId: this.modelId,
        usage: {
          inputTokens: resp.usage?.input_tokens ?? 0,
          outputTokens: resp.usage?.output_tokens ?? 0,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
        },
      };
    } catch (err) {
      recordLLMCall({
        userId: opts.meta?.userId ?? null,
        route: opts.meta?.route ?? "unknown",
        provider: this.providerName,
        model: this.modelId,
        latencyMs: Date.now() - t0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async structuredOutput<T>(opts: LLMStructuredOpts<T>): Promise<T> {
    const inputSchema = zodToJsonSchemaSafe(opts.schema, opts.schemaName);
    const toolName = opts.schemaName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);

    const t0 = Date.now();
    let resp: Awaited<ReturnType<ReturnType<typeof client>["messages"]["create"]>>;
    try {
      resp = await client().messages.create({
        model: this.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        system: this.buildSystem(opts),
        messages: this.buildMessages(opts),
        tools: [
          {
            name: toolName,
            description:
              opts.schemaDescription ??
              `Return a structured result conforming to the ${opts.schemaName} schema.`,
            input_schema: inputSchema as any,
          },
        ],
        tool_choice: { type: "tool", name: toolName } as any,
      });
    } catch (err) {
      recordLLMCall({
        userId: opts.meta?.userId ?? null,
        route: opts.meta?.route ?? "unknown",
        provider: this.providerName,
        model: this.modelId,
        latencyMs: Date.now() - t0,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    const cacheRead = (resp.usage as any)?.cache_read_input_tokens ?? 0;
    const cacheWrite = (resp.usage as any)?.cache_creation_input_tokens ?? 0;
    const logResult = (ok: boolean, error?: string) =>
      recordLLMCall({
        userId: opts.meta?.userId ?? null,
        route: opts.meta?.route ?? "unknown",
        provider: this.providerName,
        model: this.modelId,
        promptTokens: resp.usage?.input_tokens ?? 0,
        completionTokens: resp.usage?.output_tokens ?? 0,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        latencyMs: Date.now() - t0,
        ok,
        error,
      });

    const toolUse = resp.content.find((b: any) => b.type === "tool_use") as
      | { type: "tool_use"; input: unknown }
      | undefined;
    if (!toolUse) {
      logResult(false, "no tool_use block");
      throw new Error(
        `AnthropicDirectLLM.structuredOutput: model did not emit a tool_use block for ${this.modelId}`,
      );
    }
    const validated = (opts.schema as ZodType).safeParse(toolUse.input);
    if (!validated.success) {
      logResult(false, `schema validation failed: ${validated.error.message}`);
      throw new Error(
        `AnthropicDirectLLM.structuredOutput: schema validation failed: ${validated.error.message}`,
      );
    }
    logResult(true);
    return validated.data as T;
  }
}
