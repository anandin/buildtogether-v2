/**
 * LLM factory — picks the right `LLMClient` impl based on tilly_config.
 *
 * `getLLM()` reads the singleton `tilly_config` row (created lazily on
 * first call), maps `provider` to an impl, and returns the cached client.
 * The cache resets when `invalidateLLMCache()` is called from the admin
 * page after a config change.
 *
 * Defaults when no row exists:
 *   provider:      "openrouter"
 *   model:         "anthropic/claude-opus-4"
 *   embedding:     "openai/text-embedding-3-small"
 *   topK:          5
 *   threshold:     0.65
 *   strategy:      "hybrid"
 */
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { tillyConfig } from "../../../shared/schema";
import type { LLMClient } from "./types";
import { OpenRouterLLM } from "./openrouter";

type CachedConfig = {
  client: LLMClient;
  config: typeof tillyConfig.$inferSelect;
  expiresAt: number;
};

let _cache: CachedConfig | null = null;
const CACHE_TTL_MS = 30_000; // 30s — admin changes propagate within 30s

const DEFAULTS = {
  id: "default",
  provider: "openrouter" as const,
  model: "anthropic/claude-opus-4",
  embeddingModel: "openai/text-embedding-3-small",
  retrievalTopK: 5,
  similarityThreshold: 0.65,
  retrievalStrategy: "hybrid" as const,
  personaPromptOverride: null as string | null,
  toneSiblingOverride: null as string | null,
  toneCoachOverride: null as string | null,
  toneQuietOverride: null as string | null,
  maxTokens: 4096,
  updatedAt: new Date(),
};

/** Read or create the singleton config row. */
export async function getTillyConfig(): Promise<typeof tillyConfig.$inferSelect> {
  const row = await db.query.tillyConfig.findFirst({
    where: eq(tillyConfig.id, "default"),
  });
  if (row) return row;

  // Lazy-create the singleton on first use.
  const [created] = await db
    .insert(tillyConfig)
    .values({
      id: "default",
      provider: DEFAULTS.provider,
      model: DEFAULTS.model,
      embeddingModel: DEFAULTS.embeddingModel,
      retrievalTopK: DEFAULTS.retrievalTopK,
      similarityThreshold: DEFAULTS.similarityThreshold,
      retrievalStrategy: DEFAULTS.retrievalStrategy,
      maxTokens: DEFAULTS.maxTokens,
    })
    .returning();
  return created;
}

/** Build a fresh LLM client for a given config. */
function buildClient(config: typeof tillyConfig.$inferSelect): LLMClient {
  switch (config.provider) {
    case "openrouter":
      return new OpenRouterLLM(config.model);
    case "anthropic":
      // Future: native Anthropic SDK impl. For now, route through OpenRouter
      // with the equivalent Anthropic model id. Admin page warns about this.
      return new OpenRouterLLM(`anthropic/${config.model.replace(/^claude-/, "claude-")}`);
    default:
      return new OpenRouterLLM();
  }
}

/**
 * Returns a cached LLMClient. Cache lives ~30s so config changes via the
 * admin page take effect quickly without us hitting the DB every chat turn.
 */
export async function getLLM(): Promise<LLMClient> {
  if (_cache && _cache.expiresAt > Date.now()) {
    return _cache.client;
  }
  const config = await getTillyConfig();
  const client = buildClient(config);
  _cache = {
    client,
    config,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return client;
}

/** Re-read config + rebuild client immediately (admin save hook). */
export function invalidateLLMCache(): void {
  _cache = null;
}

/** Read the current resolved config (for debug + admin display). */
export async function getResolvedConfig() {
  const config = await getTillyConfig();
  return config;
}
