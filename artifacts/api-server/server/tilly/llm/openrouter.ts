/**
 * OpenRouter LLM client — raw fetch against OpenRouter's OpenAI-compatible
 * /v1/chat/completions endpoint.
 *
 * Why not the OpenAI SDK: v6+ of the SDK validates request bodies and
 * silently drops or rejects unknown fields like `extra_body`. We need
 * to pass `cache_control` (Anthropic prompt-cache hint) through to the
 * upstream provider, so a hand-built request is more reliable.
 *
 * For structured outputs we use OpenRouter's `response_format` with
 * `type: "json_schema"` and a Zod-derived JSON Schema — same contract
 * as OpenAI's structured outputs. We validate locally with Zod after
 * receiving the response.
 */
import type { ZodType } from "zod";
import { z } from "zod";

import type {
  LLMClient,
  LLMTextOpts,
  LLMTextResult,
  LLMStructuredOpts,
  ChatMessage,
} from "./types";
import { DEFAULT_MODELS } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Pull a JSON-shaped substring out of model output that may be wrapped
 * in ```json fences or have leading/trailing prose. Used by
 * structuredOutput so Haiku's "here's the JSON: ```json {...} ```"
 * style replies parse cleanly. Returns the raw text unchanged when no
 * obvious payload is found so JSON.parse can still throw a useful error.
 */
function extractJsonPayload(raw: string): string {
  const text = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences first.
  const fenceMatch = text.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;
  // If candidate already starts with { or [, use it as-is.
  if (candidate.startsWith("{") || candidate.startsWith("[")) return candidate;
  // Otherwise slice from the first { or [ to the last } or ].
  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
        ? firstObj
        : Math.min(firstObj, firstArr);
  if (start === -1) return candidate;
  const lastObj = candidate.lastIndexOf("}");
  const lastArr = candidate.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end <= start) return candidate;
  return candidate.slice(start, end + 1);
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY not set — Tilly cannot speak. Add it to Vercel env vars.",
    );
  }
  return key;
}

/**
 * Convert a Zod schema to a JSON Schema object suitable for OpenRouter's
 * structured-output `response_format`. Uses zod-to-json-schema if available,
 * otherwise falls back to a hand-rolled converter for simple schemas.
 *
 * Zod's `.describe()` calls become JSON Schema `description` fields, which
 * the upstream provider uses as guidance.
 */
function zodToJsonSchemaSafe(schema: ZodType, name: string): {
  name: string;
  schema: Record<string, unknown>;
  strict: boolean;
} {
  // Use the standard library if installed (it ships with Zod ^3.24+).
  // We avoid a hard import by trying require-style resolution first.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("zod-to-json-schema");
    const ztjs = mod.zodToJsonSchema || mod.default;
    if (ztjs) {
      const json = ztjs(schema, { name, $refStrategy: "none" }) as Record<string, unknown>;
      // Some versions wrap under definitions[name]; unwrap.
      let body: Record<string, unknown> = json;
      if ((json as any).definitions && (json as any).definitions[name]) {
        body = (json as any).definitions[name] as Record<string, unknown>;
      } else if ((json as any).$ref) {
        body = (json as any).definitions?.[name] ?? json;
      }
      stripUnsupported(body);
      return { name, schema: body, strict: false };
    }
  } catch {
    // fall through
  }
  // Trivial fallback — Zod has _def we could walk, but the schemas we use
  // here are simple objects of primitives + enums + arrays, and the model
  // tolerates an empty schema with just `type: object` (it just won't be
  // strict). Better than failing.
  stripUnsupported({});
  return { name, schema: { type: "object" }, strict: false };
}

/**
 * JSON Schema features OpenRouter / upstream providers commonly reject
 * (or that pull in unsupported keywords). We strip them defensively.
 *
 * Anthropic in particular rejects: `minItems`, `maxItems`, `minimum`,
 * `maximum`, `minLength`, `maxLength`, `multipleOf`, `format`, `pattern`,
 * `additionalProperties` (unless boolean), `$schema`, `default`. We
 * delete these recursively so a Zod `.max(5)` or `.min(0)` doesn't 400
 * the request — range constraints belong in the prompt anyway.
 */
const UNSUPPORTED_KEYS = [
  "$schema",
  "default",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "multipleOf",
  "format",
  "pattern",
];

function stripUnsupported(s: Record<string, unknown>) {
  if (!s || typeof s !== "object") return;
  for (const k of UNSUPPORTED_KEYS) {
    delete (s as any)[k];
  }
  // additionalProperties: <schema> is rejected; boolean is fine.
  if (
    (s as any).additionalProperties &&
    typeof (s as any).additionalProperties !== "boolean"
  ) {
    delete (s as any).additionalProperties;
  }
  if ((s as any).properties) {
    for (const k of Object.keys((s as any).properties)) {
      stripUnsupported((s as any).properties[k]);
    }
  }
  if ((s as any).items) stripUnsupported((s as any).items);
  // anyOf/oneOf/allOf nested schemas
  for (const variant of ["anyOf", "oneOf", "allOf"]) {
    const arr = (s as any)[variant];
    if (Array.isArray(arr)) {
      for (const sub of arr) stripUnsupported(sub);
    }
  }
}

type ChatRequestBody = {
  model: string;
  max_tokens: number;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean };
  };
  // Allow arbitrary fields for OpenRouter pass-through.
  [k: string]: unknown;
};

async function callOpenRouter(body: ChatRequestBody): Promise<{
  text: string;
  usage: { prompt_tokens?: number; completion_tokens?: number };
  raw: any;
}> {
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://buildtogether-v2.vercel.app",
      "X-Title": "BuildTogether (Tilly)",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 2000)}`);
  }
  const json = (await res.json()) as any;
  const text = json?.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: json?.usage ?? {},
    raw: json,
  };
}

export class OpenRouterLLM implements LLMClient {
  readonly providerName = "openrouter";
  readonly modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? DEFAULT_MODELS.openrouter.chat;
  }

  /**
   * Concatenate `systemPrompts[]` into a single system message because
   * OpenAI Chat Completions only supports one role:"system" at the start.
   * Anthropic prompt-cache hint goes through extra fields (currently no
   * effect through OpenRouter's normal flow but harmless if upstream
   * extends).
   */
  private buildBody(opts: LLMTextOpts): ChatRequestBody {
    const sysJoined = opts.systemPrompts.filter(Boolean).join("\n\n---\n\n");
    const messages: ChatRequestBody["messages"] = [
      { role: "system", content: sysJoined },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    const body: ChatRequestBody = {
      model: this.modelId,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
    };
    if (opts.extra) Object.assign(body, opts.extra);
    return body;
  }

  async textReply(opts: LLMTextOpts): Promise<LLMTextResult> {
    const body = this.buildBody(opts);
    const { text, usage } = await callOpenRouter(body);
    return {
      text,
      modelId: this.modelId,
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      },
    };
  }

  async structuredOutput<T>(opts: LLMStructuredOpts<T>): Promise<T> {
    const body = this.buildBody(opts);
    body.response_format = {
      type: "json_schema",
      json_schema: zodToJsonSchemaSafe(opts.schema, opts.schemaName),
    };

    const { text } = await callOpenRouter(body);
    if (!text) {
      throw new Error(
        `OpenRouterLLM.structuredOutput: empty response from ${this.modelId}`,
      );
    }
    // Some OpenRouter-routed models (notably Haiku) wrap structured
    // output in ```json fences or trail prose around the payload, even
    // when response_format=json_schema is set. Strip fences and slice
    // to the outermost {...} / [...] before JSON.parse so reminder/
    // memory classifiers don't silently fail. Falls through to the
    // original error if no JSON-shaped substring is found.
    const cleaned = extractJsonPayload(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `OpenRouterLLM.structuredOutput: model returned non-JSON content: ${text.slice(0, 200)}`,
      );
    }
    let validated = (opts.schema as ZodType).safeParse(parsed);

    // Heuristic: some models (Haiku in particular) return a bare array
    // even when the schema is `{ singleProp: <array> }`. If the schema
    // wraps a single array property and the model gave us an array,
    // wrap it before re-validating. Cheap save vs. losing the response.
    if (!validated.success && Array.isArray(parsed)) {
      const wrappedKey = singleArrayPropertyName(opts.schema as ZodType);
      if (wrappedKey) {
        validated = (opts.schema as ZodType).safeParse({
          [wrappedKey]: parsed,
        });
      }
    }

    if (!validated.success) {
      // Include a short snapshot of the *parsed* body so future
      // failures are debuggable from logs alone (the raw text is also
      // usually fine but parsed makes the shape mismatch obvious).
      const snapshot = JSON.stringify(parsed).slice(0, 300);
      throw new Error(
        `OpenRouterLLM.structuredOutput: schema validation failed: ${validated.error.message} | parsed: ${snapshot}`,
      );
    }
    return validated.data as T;
  }
}

/**
 * If a Zod object schema has exactly one property and that property is
 * an array, return its name. Used to auto-wrap a bare array response
 * into the expected `{ key: [...] }` shape for tolerant parsing.
 * Returns null when the schema doesn't match this pattern.
 */
function singleArrayPropertyName(schema: ZodType): string | null {
  try {
    const def = (schema as any)._def;
    if (!def || def.typeName !== "ZodObject") return null;
    const shape =
      typeof def.shape === "function" ? def.shape() : def.shape;
    const keys = Object.keys(shape ?? {});
    if (keys.length !== 1) return null;
    const inner = shape[keys[0]];
    // Unwrap optional/default/nullable to find the underlying type.
    let cur = inner?._def;
    while (
      cur &&
      (cur.typeName === "ZodOptional" ||
        cur.typeName === "ZodDefault" ||
        cur.typeName === "ZodNullable")
    ) {
      cur = cur.innerType?._def;
    }
    if (cur?.typeName === "ZodArray") return keys[0];
    return null;
  } catch {
    return null;
  }
}
