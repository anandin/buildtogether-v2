/**
 * Embeddings via OpenRouter — used by the RAG retriever.
 *
 * Phase 2.5: routes through OpenRouter's embeddings endpoint
 * (`/v1/embeddings`, OpenAI-compatible) using the model configured in
 * `tilly_config.embedding_model` (default `openai/text-embedding-3-small`,
 * 1536 dims).
 *
 * Returns a `number[]` regardless of model — the embeddings table column
 * is `real[]` and the cosine helper takes plain arrays.
 */
import OpenAI from "openai";
import { getTillyConfig } from "./llm/factory";
import { recordLLMCall } from "./llm/cost-log";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  // Boot validation in env-validation.ts already guarantees this is set,
  // but we re-check defensively in case the module is imported in a
  // serverless cold-start path that bypasses getApp() (e.g. cron handlers).
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set — Tilly RAG embeddings unavailable. " +
        "This should have failed at boot; check env-validation.ts.",
    );
  }
  _client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": "https://buildtogether-v2.vercel.app",
      "X-Title": "BuildTogether (Tilly) embeddings",
    },
  });
  return _client;
}

/**
 * Embed a single string. Returns null on failure — callers treat null as
 * "skip this memory" rather than blocking the chat reply.
 *
 * `meta` is optional cost-tracking attribution. Pass {userId, route} when
 * the caller knows which user/operation prompted the embed; the row is
 * appended to tilly_llm_call_log either way (route="embedding" by default).
 */
export async function embed(
  text: string,
  meta?: { userId?: string | null; route?: string },
): Promise<number[] | null> {
  const t0 = Date.now();
  let modelId = "unknown";
  try {
    const config = await getTillyConfig();
    modelId = config.embeddingModel;
    const resp = await client().embeddings.create({
      model: config.embeddingModel,
      input: text,
    });
    const vec = resp.data[0]?.embedding;
    // OpenAI's embedding response shape: { usage: { prompt_tokens, total_tokens } }.
    // The SDK type is correct; destructure typed instead of casting.
    const usage: { prompt_tokens?: number } | undefined = resp.usage;
    recordLLMCall({
      userId: meta?.userId ?? null,
      route: meta?.route ?? "embedding",
      provider: "openrouter",
      model: modelId,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: 0,
      latencyMs: Date.now() - t0,
      ok: !!vec,
      error: vec ? null : "no embedding returned",
    });
    if (!vec || !Array.isArray(vec)) return null;
    return vec;
  } catch (err) {
    recordLLMCall({
      userId: meta?.userId ?? null,
      route: meta?.route ?? "embedding",
      provider: "openrouter",
      model: modelId,
      latencyMs: Date.now() - t0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error("embed failed:", err);
    return null;
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
