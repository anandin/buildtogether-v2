/**
 * L2a memory archiver — soft-archives stale `tilly_memory` rows so the
 * retriever's last-500 scan stays focused on recent, relevant context.
 *
 * Rules:
 *   - Never archive `commitment` or `value` kinds. These are the "Tilly's
 *     character" memories that anchor every conversation — recency is
 *     irrelevant for them. (See KIND_BUMPS in retriever.ts.)
 *   - Honor each user's `memoryRetention` preference:
 *       forever (default) → only archive low-signal `observation` rows
 *                           older than 365 days as a safety valve
 *       1y                → archive any non-anchor row older than 365 days
 *       90d               → archive any non-anchor row older than 90 days
 *   - Soft-archive only: sets `archived_at = now()`. Rows stay in the
 *     table for traceability; the retriever filters them via `isNull(archivedAt)`.
 */
import { and, eq, isNull, lt, notInArray } from "drizzle-orm";
import { db } from "../db";
import { tillyMemory, tillyTonePref, users } from "../../shared/schema";

const ANCHOR_KIND_LIST = ["commitment", "value"];

type RetentionBucket = "forever" | "1y" | "90d";

function ageCutoffDays(retention: RetentionBucket): number | null {
  if (retention === "90d") return 90;
  if (retention === "1y") return 365;
  // forever: only sweep observation rows older than 1 year as a safety valve
  return 365;
}

export interface ArchiveResult {
  scanned: number;
  archived: number;
  byUser: { userId: string; archived: number; retention: RetentionBucket }[];
}

/**
 * Sweep stale memories for every user. Returns aggregate stats.
 * Designed to be cheap: one UPDATE per user, capped via WHERE clause.
 */
export async function archiveStaleMemories(
  now: Date = new Date(),
): Promise<ArchiveResult> {
  // Pull every user that has at least one active memory, plus their
  // retention pref (left join — defaults to "forever" if no pref row).
  const rows = await db
    .select({
      userId: users.id,
      retention: tillyTonePref.memoryRetention,
    })
    .from(users)
    .leftJoin(tillyTonePref, eq(tillyTonePref.userId, users.id));

  const byUser: ArchiveResult["byUser"] = [];
  let totalArchived = 0;

  for (const row of rows) {
    const retention = (row.retention ?? "forever") as RetentionBucket;
    const cutoffDays = ageCutoffDays(retention);
    if (cutoffDays == null) continue;
    const cutoff = new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000);

    // forever bucket: only sweep `observation` rows; preserve everything else.
    // 1y/90d buckets: sweep everything except anchor kinds (commitment/value).
    const kindFilter =
      retention === "forever"
        ? eq(tillyMemory.kind, "observation")
        : notInArray(tillyMemory.kind, ANCHOR_KIND_LIST);

    const result = await db
      .update(tillyMemory)
      .set({ archivedAt: now })
      .where(
        and(
          eq(tillyMemory.userId, row.userId),
          isNull(tillyMemory.archivedAt),
          lt(tillyMemory.noticedAt, cutoff),
          kindFilter,
        ),
      )
      .returning({ id: tillyMemory.id });

    if (result.length > 0) {
      byUser.push({ userId: row.userId, archived: result.length, retention });
      totalArchived += result.length;
    }
  }

  return {
    scanned: rows.length,
    archived: totalArchived,
    byUser,
  };
}
