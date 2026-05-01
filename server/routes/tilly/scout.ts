/**
 * Scout endpoints — S8.
 *
 *   POST /api/tilly/scout         — enqueue a new scout job
 *                                   body: { query: string, location?: string }
 *                                   returns: { jobId, status: 'queued' }
 *   GET  /api/tilly/scout/:id     — read one job's status + result
 *   GET  /api/tilly/scout/recent  — list recent jobs for the user (for UI)
 */
import type { Express, Request, Response } from "express";
import { eq, and, desc } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import { tillyScoutJobs } from "../../../shared/schema";
import { enqueueScout } from "../../tilly/scout/orchestrator";
import { tavilySearch } from "../../tilly/scout/tavily";

export function mountScoutRoutes(app: Express): void {
  app.post(
    "/api/tilly/scout",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });

      const query = String(req.body?.query ?? "").trim();
      if (!query) return res.status(400).json({ error: "query required" });
      if (query.length > 200)
        return res.status(400).json({ error: "query too long" });

      const location =
        typeof req.body?.location === "string" && req.body.location.trim()
          ? req.body.location.trim().slice(0, 100)
          : null;

      const jobId = await enqueueScout({
        userId: req.user.id,
        householdId,
        query,
        location,
      });
      res.json({ jobId, status: "queued" });
    },
  );

  app.get(
    "/api/tilly/scout/recent",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const rows = await db
        .select()
        .from(tillyScoutJobs)
        .where(eq(tillyScoutJobs.userId, req.user.id))
        .orderBy(desc(tillyScoutJobs.createdAt))
        .limit(20);
      res.json({
        jobs: rows.map((r) => ({
          id: r.id,
          query: r.query,
          location: r.location,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          summary:
            r.result && typeof r.result === "object" && "summary" in r.result
              ? (r.result as { summary?: string }).summary
              : null,
        })),
      });
    },
  );

  // Debug: hit Tavily directly through the same client the orchestrator
  // uses, so we can see exactly what the function-side fetch returns.
  app.post(
    "/api/tilly/_debug/tavily",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const query = String(req.body?.query ?? "Levis 501 jeans Toronto");
      const hasKey = !!process.env.TAVILY_API_KEY;
      const keyPrefix = (process.env.TAVILY_API_KEY ?? "").slice(0, 10);
      const r = await tavilySearch({ query, maxResults: 3 });
      res.json({
        env: { hasKey, keyPrefix },
        query,
        resultCount: r.results.length,
        responseTimeMs: r.responseTimeMs,
        firstResult: r.results[0] ?? null,
      });
    },
  );

  app.get(
    "/api/tilly/scout/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const id = String(req.params.id);
      const row = await db.query.tillyScoutJobs.findFirst({
        where: and(
          eq(tillyScoutJobs.id, id),
          eq(tillyScoutJobs.userId, req.user.id),
        ),
      });
      if (!row) return res.status(404).json({ error: "scout_not_found" });
      res.json({
        id: row.id,
        query: row.query,
        location: row.location,
        status: row.status,
        result: row.result ?? null,
        errorText: row.errorText ?? null,
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      });
    },
  );
}
