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

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not set — embeddings unavailable");
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
 */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const config = await getTillyConfig();
    const resp = await client().embeddings.create({
      model: config.embeddingModel,
      input: text,
    });
    const vec = resp.data[0]?.embedding;
    if (!vec || !Array.isArray(vec)) return null;
    return vec;
  } catch (err) {
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
