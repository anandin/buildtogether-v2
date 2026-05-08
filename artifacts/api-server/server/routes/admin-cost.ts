/**
 * Admin Cost API — feeds the /admin Cost tab.
 *
 * Reads from `tilly_llm_call_log` (every LLM/embed call appends one row,
 * fire-and-forget from the LLM clients). All endpoints are admin-gated.
 *
 *   GET /api/admin/cost/summary?days=7|30|90
 *     → { totalUsd, totalCalls, byUser:[{userId,email,name,calls,usd}],
 *         byRoute:[{route,calls,usd}], byModel:[{model,calls,usd}] }
 *   GET /api/admin/cost/recent?limit=100&userId?
 *     → { rows:[{...llmCallLog row + user.email}] }
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { tillyLlmCallLog, users } from "../../shared/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

export function mountAdminCostRoutes(app: Express): void {
  // ── /summary — aggregated totals over a rolling window ───────────────
  app.get(
    "/api/admin/cost/summary",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Totals
        const [totals] = await db
          .select({
            totalUsd: sql<number>`coalesce(sum(${tillyLlmCallLog.costUsd}), 0)`,
            totalCalls: sql<number>`count(*)`,
            okCalls: sql<number>`sum(case when ${tillyLlmCallLog.ok} then 1 else 0 end)`,
            promptTokens: sql<number>`coalesce(sum(${tillyLlmCallLog.promptTokens}), 0)`,
            completionTokens: sql<number>`coalesce(sum(${tillyLlmCallLog.completionTokens}), 0)`,
          })
          .from(tillyLlmCallLog)
          .where(gte(tillyLlmCallLog.createdAt, since));

        // Per-user (left-join users for display name/email)
        const byUser = await db
          .select({
            userId: tillyLlmCallLog.userId,
            email: users.email,
            name: users.name,
            calls: sql<number>`count(*)`.as("calls"),
            usd: sql<number>`coalesce(sum(${tillyLlmCallLog.costUsd}), 0)`.as("usd"),
          })
          .from(tillyLlmCallLog)
          .leftJoin(users, eq(users.id, tillyLlmCallLog.userId))
          .where(gte(tillyLlmCallLog.createdAt, since))
          .groupBy(tillyLlmCallLog.userId, users.email, users.name)
          .orderBy(desc(sql`sum(${tillyLlmCallLog.costUsd})`))
          .limit(200);

        // Per-route
        const byRoute = await db
          .select({
            route: tillyLlmCallLog.route,
            calls: sql<number>`count(*)`.as("calls"),
            usd: sql<number>`coalesce(sum(${tillyLlmCallLog.costUsd}), 0)`.as("usd"),
          })
          .from(tillyLlmCallLog)
          .where(gte(tillyLlmCallLog.createdAt, since))
          .groupBy(tillyLlmCallLog.route)
          .orderBy(desc(sql`sum(${tillyLlmCallLog.costUsd})`));

        // Per-model
        const byModel = await db
          .select({
            model: tillyLlmCallLog.model,
            calls: sql<number>`count(*)`.as("calls"),
            usd: sql<number>`coalesce(sum(${tillyLlmCallLog.costUsd}), 0)`.as("usd"),
          })
          .from(tillyLlmCallLog)
          .where(gte(tillyLlmCallLog.createdAt, since))
          .groupBy(tillyLlmCallLog.model)
          .orderBy(desc(sql`sum(${tillyLlmCallLog.costUsd})`));

        res.json({
          windowDays: days,
          totals,
          byUser,
          byRoute,
          byModel,
        });
      } catch (err) {
        console.error("/api/admin/cost/summary failed:", err);
        res.status(500).json({ error: "summary_failed" });
      }
    },
  );

  // ── /recent — recent rows, optionally filtered by userId ─────────────
  app.get(
    "/api/admin/cost/recent",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
        const userId = (req.query.userId as string | undefined) || undefined;

        const where = userId
          ? and(eq(tillyLlmCallLog.userId, userId))
          : undefined;

        const rows = await db
          .select({
            id: tillyLlmCallLog.id,
            userId: tillyLlmCallLog.userId,
            email: users.email,
            route: tillyLlmCallLog.route,
            provider: tillyLlmCallLog.provider,
            model: tillyLlmCallLog.model,
            promptTokens: tillyLlmCallLog.promptTokens,
            completionTokens: tillyLlmCallLog.completionTokens,
            cacheReadTokens: tillyLlmCallLog.cacheReadTokens,
            cacheWriteTokens: tillyLlmCallLog.cacheWriteTokens,
            costUsd: tillyLlmCallLog.costUsd,
            latencyMs: tillyLlmCallLog.latencyMs,
            ok: tillyLlmCallLog.ok,
            error: tillyLlmCallLog.error,
            createdAt: tillyLlmCallLog.createdAt,
          })
          .from(tillyLlmCallLog)
          .leftJoin(users, eq(users.id, tillyLlmCallLog.userId))
          .where(where)
          .orderBy(desc(tillyLlmCallLog.createdAt))
          .limit(limit);

        res.json({ rows });
      } catch (err) {
        console.error("/api/admin/cost/recent failed:", err);
        res.status(500).json({ error: "recent_failed" });
      }
    },
  );
}
