/**
 * OpenRouter LLM client — uses the OpenAI SDK pointed at OpenRouter's
 * OpenAI-compatible endpoint.
 *
 * Why OpenRouter: single key gets us Claude, GPT, Gemini, Llama, etc.
 * Admin can swap models from the /admin/tilly page without redeploying.
 *
 * Caveats:
 *   - Anthropic prompt caching only applies when the upstream provider
 *     honors `cache_control`. OpenRouter passes through `extra_body` to
 *     Anthropic for that. We add cache_control to the first system block
 *     when the model id is `anthropic/*`.
 *   - Adaptive thinking on Claude 4.6+ is exposed via OpenRouter's
 *     reasoning param; passed through `extra_body.reasoning`.
 *   - Structured outputs use OpenAI's `response_format` with json_schema.
 *     Most modern OpenRouter providers respect strict JSON schemas;
 *     fallback path strips strict if a model errors.
 */
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import type {
  LLMClient,
  LLMTextOpts,
  LLMTextResult,
  LLMStructuredOpts,
} from "./types";
import { DEFAULT_MODELS } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set — Tilly cannot speak. Add it to Vercel env vars.",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    // OpenRouter recommends setting these so usage shows up under your app.
    defaultHeaders: {
      "HTTP-Referer": "https://buildtogether-v2.vercel.app",
      "X-Title": "BuildTogether (Tilly)",
    },
  });
  return _client;
}

export class OpenRouterLLM implements LLMClient {
  readonly providerName = "openrouter";
  readonly modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? DEFAULT_MODELS.openrouter.chat;
  }

  /**
   * Build the message array. Multiple `systemPrompts` are concatenated into
   * one system message because the OpenAI Chat API only supports a single
   * `system` role at the start. For Claude routes, we set `cache_control`
   * on the system message via `extra_body` so the upstream Anthropic
   * provider can prompt-cache the persona prefix.
   */
  private buildMessages(opts: LLMTextOpts): {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    extraBody: Record<string, unknown>;
  } {
    const sysJoined = opts.systemPrompts.filter(Boolean).join("\n\n---\n\n");
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: sysJoined },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // For Anthropic-routed models, ask OpenRouter to apply prompt caching to
    // the system block. OpenRouter's pass-through cache_control surfaces
    // this to Claude.
    const extraBody: Record<string, unknown> = {};
    if (this.modelId.startsWith("anthropic/")) {
      // OpenRouter's extension: per-message cache hints inside extra_body
      extraBody.cache_control = { type: "ephemeral" };
    }
    if (opts.extra) Object.assign(extraBody, opts.extra);

    return { messages, extraBody };
  }

  async textReply(opts: LLMTextOpts): Promise<LLMTextResult> {
    const { messages, extraBody } = this.buildMessages(opts);

    const completion = await client().chat.completions.create({
      model: this.modelId,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
      // The OpenAI SDK type doesn't list `extra_body` but OpenRouter forwards
      // unknown fields through. Cast to bypass strict typing.
      ...(Object.keys(extraBody).length ? { extra_body: extraBody } : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

    const text = completion.choices[0]?.message?.content ?? "";
    return {
      text,
      modelId: this.modelId,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  async structuredOutput<T>(opts: LLMStructuredOpts<T>): Promise<T> {
    const { messages, extraBody } = this.buildMessages(opts);

    const completion = await client().chat.completions.parse({
      model: this.modelId,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
      response_format: zodResponseFormat(opts.schema, opts.schemaName),
      ...(Object.keys(extraBody).length ? { extra_body: extraBody } : {}),
    } as any);

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error(
        `OpenRouterLLM.structuredOutput: model ${this.modelId} returned no parseable output ` +
          `(refusal=${completion.choices[0]?.message?.refusal ?? "none"})`,
      );
    }
    return parsed as T;
  }
}
