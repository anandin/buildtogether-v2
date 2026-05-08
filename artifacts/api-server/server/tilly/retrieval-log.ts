/**
 * Retrieval log writer + reader.
 *
 * Every chat turn / on-demand analysis logs which memories the hybrid
 * retriever surfaced, with their scores. Powers the admin transparency
 * surface ("for THIS turn, Tilly pulled these N notes") and lets us
 * A/B retrieval-strategy changes against outcomes.
 *
 * Pruning: keep the latest ~200 rows per user. We delete from inside
 * the writer so there's no cron dependency — the table stays bounded
 * even if the admin never visits.
 */
import { eq, desc, sql, and } from "drizzle-orm";

import { db } from "../db";
import { tillyRetrievalLog, type TillyRetrievalLog } from "../../shared/schema";
import type { RetrievedMemory } from "./retriever";

const MAX_ROWS_PER_USER = 200;

export interface LogRetrievalInput {
  userId: string;
  conversationId?: string | null;
  kind: "chat" | "analysis";
  memories: RetrievedMemory[];
  strategy: string;
  promptSize: number;
}

export async function logRetrieval(input: LogRetrievalInput): Promise<void> {
  try {
    await db.insert(tillyRetrievalLog).values({
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      kind: input.kind,
      memoryIds: input.memories.map((m) => m.id),
      scores: input.memories.map((m) => Number(m.score.toFixed(4))),
      strategy: input.strategy,
      promptSize: input.promptSize,
    });
    // Best-effort prune. Soft cap; drift of a few rows is fine.
    await db.execute(sql`
      DELETE FROM tilly_retrieval_log
      WHERE user_id = ${input.userId}
        AND id NOT IN (
          SELECT id FROM tilly_retrieval_log
          WHERE user_id = ${input.userId}
          ORDER BY created_at DESC
          LIMIT ${MAX_ROWS_PER_USER}
        )
    `);
  } catch (err) {
    // Never let retrieval logging break a chat turn.
    console.warn("[retrieval-log] write failed:", err);
  }
}

/**
 * Latest log row for this user. Optionally filtered by kind so the
 * admin can see "latest chat retrieval" and "latest analysis
 * retrieval" side by side.
 */
export async function getLatestRetrieval(
  userId: string,
  kind?: "chat" | "analysis",
): Promise<TillyRetrievalLog | null> {
  const where = kind
    ? and(eq(tillyRetrievalLog.userId, userId), eq(tillyRetrievalLog.kind, kind))
    : eq(tillyRetrievalLog.userId, userId);
  const rows = await db
    .select()
    .from(tillyRetrievalLog)
    .where(where)
    .orderBy(desc(tillyRetrievalLog.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
