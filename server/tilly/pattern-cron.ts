/**
 * Pattern detection cron — runs weekly (Mon 4am UTC via vercel.json).
 *
 * Walks every household, runs the existing buildWeeklyPattern, and if a
 * soft-spot is detected, writes a `tilly_memory` row with kind='observation'
 * so the Tilly Learned card on Home has something specific to surface
 * tomorrow morning. Memory rows are deduped by body for 14 days so the
 * same observation doesn't write a fresh memory every Monday.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { households, members, tillyMemory, users } from "../../shared/schema";
import { buildWeeklyPattern } from "./spend-pattern";

/**
 * Resolve the "owner user" for a household. Tries members.role='owner'
 * first; falls back to any member; falls back to users.coupleId. Solo
 * student households often skip the members row, so the third lookup
 * is the realistic happy-path.
 */
async function resolveOwner(householdId: string): Promise<string | null> {
  const memberOwner = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.coupleId, householdId), eq(members.role, "owner")))
    .limit(1);
  if (memberOwner[0]?.userId) return memberOwner[0].userId;

  const anyMember = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.coupleId, householdId))
    .limit(1);
  if (anyMember[0]?.userId) return anyMember[0].userId;

  const userOwner = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.coupleId, householdId))
    .limit(1);
  return userOwner[0]?.id ?? null;
}

export async function runPatternDetectionAll(): Promise<{
  households: number;
  observations: number;
}> {
  const allHouseholds = await db
    .select({ id: households.id })
    .from(households)
    .limit(1000);
  let observations = 0;
  for (const h of allHouseholds) {
    try {
      const userId = await resolveOwner(h.id);
      if (!userId) continue;

      const pattern = await buildWeeklyPattern(h.id);
      if (!pattern || !pattern.italicSpan) continue;

      const body = `${pattern.italicSpan} are still your soft spot. ${pattern.headline}`;

      // 14-day dedupe by body.
      const dupe = await db
        .select({ id: tillyMemory.id })
        .from(tillyMemory)
        .where(
          and(
            eq(tillyMemory.userId, userId),
            eq(tillyMemory.body, body),
            sql`${tillyMemory.noticedAt} >= NOW() - INTERVAL '14 days'`,
          ),
        )
        .limit(1);
      if (dupe.length > 0) continue;

      await db.insert(tillyMemory).values({
        userId,
        householdId: h.id,
        kind: "observation",
        body,
        source: "inferred",
        dateLabel: "This week",
        isMostRecent: true,
      });
      observations++;
    } catch (err) {
      console.warn("[pattern-cron] household failed:", h.id, err);
    }
  }
  return { households: allHouseholds.length, observations };
}
