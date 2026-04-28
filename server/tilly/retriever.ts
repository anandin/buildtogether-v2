/**
 * Hybrid retriever — pulls Tilly's most-relevant memories for a chat turn.
 *
 * Spec D7 (self-learning + RAG). Three strategies controlled by
 * tilly_config.retrieval_strategy:
 *
 *   - `recency_only`   — order by noticed_at DESC, take top-K
 *   - `semantic_only`  — embed the query, score by cosine similarity, take
 *                        top-K above similarity_threshold
 *   - `hybrid`         — semantic + recency boost (newer memories get a
 *                        score bump; commitments + values get bumped extra)
 *
 * Returns first-person snippets ready to drop into the persona system
 * block. Empty array on no useful matches — chat still works, just without
 * memory context.
 */
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "../db";
import { tillyMemory } from "../../shared/schema";
import { embed, cosineSimilarity } from "./embeddings";
import { getTillyConfig } from "./llm/factory";

export type RetrievedMemory = {
  id: string;
  body: string;
  kind: string;
  dateLabel: string;
  noticedAt: Date;
  score: number;
  semanticScore: number;
  recencyScore: number;
};

/**
 * Recency score: exponential decay with a configurable half-life. A memory
 * from `recencyHalfLifeHours` ago gets 0.5; from 2 half-lives ago, 0.25.
 */
function recencyScore(noticedAt: Date, halfLifeHours: number, now: Date): number {
  const ageHours = (now.getTime() - noticedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

/**
 * Bumps for kinds that should always weigh heavier even when older — these
 * are the "Tilly's character" memories that anchor every conversation.
 */
const KIND_BUMPS: Record<string, number> = {
  commitment: 1.25,
  value: 1.2,
  anxiety: 1.1,
  preference: 1.05,
  observation: 1.0,
};

export async function hybridRetrieve(
  userId: string,
  queryText: string,
  override?: { topK?: number; threshold?: number; strategy?: string },
): Promise<RetrievedMemory[]> {
  const config = await getTillyConfig();
  const topK = override?.topK ?? config.retrievalTopK;
  const threshold = override?.threshold ?? config.similarityThreshold;
  const strategy = override?.strategy ?? config.retrievalStrategy;
  const halfLife = config.recencyHalfLifeHours;
  const now = new Date();

  // Pull all active memories for this user. At Tilly's scale (a few hundred
  // per user max) this is fine. Phase 6 introduces an HNSW index when read
  // volume justifies the maintenance cost.
  const rows = await db
    .select()
    .from(tillyMemory)
    .where(and(eq(tillyMemory.userId, userId), isNull(tillyMemory.archivedAt)))
    .orderBy(desc(tillyMemory.noticedAt))
    .limit(500);

  if (rows.length === 0) return [];

  // Recency-only: skip the embedding call entirely.
  if (strategy === "recency_only") {
    return rows.slice(0, topK).map((r) => ({
      id: r.id,
      body: r.body,
      kind: r.kind,
      dateLabel: r.dateLabel,
      noticedAt: r.noticedAt,
      semanticScore: 0,
      recencyScore: recencyScore(r.noticedAt, halfLife, now),
      score: recencyScore(r.noticedAt, halfLife, now),
    }));
  }

  // Otherwise: embed the query and score against each memory's embedding.
  const queryVec = await embed(queryText);
  if (!queryVec) {
    // Fallback to recency if embeddings provider is down.
    return rows.slice(0, topK).map((r) => ({
      id: r.id,
      body: r.body,
      kind: r.kind,
      dateLabel: r.dateLabel,
      noticedAt: r.noticedAt,
      semanticScore: 0,
      recencyScore: recencyScore(r.noticedAt, halfLife, now),
      score: recencyScore(r.noticedAt, halfLife, now),
    }));
  }

  const scored: RetrievedMemory[] = rows.map((r) => {
    const semanticScore = r.embedding ? cosineSimilarity(queryVec, r.embedding) : 0;
    const recScore = recencyScore(r.noticedAt, halfLife, now);
    const kindBump = KIND_BUMPS[r.kind] ?? 1.0;

    let score: number;
    if (strategy === "semantic_only") {
      score = semanticScore;
    } else {
      // hybrid: 70% semantic + 30% recency, then kind-bumped
      score = (semanticScore * 0.7 + recScore * 0.3) * kindBump;
    }

    return {
      id: r.id,
      body: r.body,
      kind: r.kind,
      dateLabel: r.dateLabel,
      noticedAt: r.noticedAt,
      semanticScore,
      recencyScore: recScore,
      score,
    };
  });

  // Filter by threshold (semantic_only) or by min score (hybrid uses a
  // softer floor since the recency component lifts older notes).
  const filtered =
    strategy === "semantic_only"
      ? scored.filter((s) => s.semanticScore >= threshold)
      : scored.filter((s) => s.score >= threshold * 0.6);

  return filtered.sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Convenience: return just the body text snippets, formatted for dropping
 * into a system prompt block. Includes a header line so the model knows
 * what the snippets are.
 */
export async function retrieveContextSnippets(
  userId: string,
  queryText: string,
): Promise<string[]> {
  const memories = await hybridRetrieve(userId, queryText);
  return memories.map((m) => `[${m.kind}, ${m.dateLabel}] ${m.body}`);
}
