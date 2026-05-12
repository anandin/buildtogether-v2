/**
 * Watchlist routes — Sprint A habit-hook backend.
 *
 * GET  /api/tilly/watchlist          — list active items
 * POST /api/tilly/watchlist          — add { name, estimatedPrice? }
 * PATCH /api/tilly/watchlist/:id     — update status (bought/dropped) or fields
 * DELETE /api/tilly/watchlist/:id    — remove
 *
 * Active items power: the Today tile count, the daily 9am nudge, and a
 * dossier line in the chat system prompt so Tilly can reference desires
 * mid-conversation without re-asking.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { watchlistItems } from "../../shared/schema";

export function mountWatchlistRoutes(app: Express): void {
  app.get("/api/tilly/watchlist", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ items: [] });
    try {
      const rows = await db
        .select()
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.householdId, householdId),
            eq(watchlistItems.status, "active"),
          ),
        )
        .orderBy(desc(watchlistItems.addedAt))
        .limit(50);
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          estimatedPrice: r.estimatedPrice,
          addedAt: r.addedAt.toISOString(),
          lastNudgedAt: r.lastNudgedAt?.toISOString() ?? null,
        })),
      });
    } catch (err) {
      console.error("/api/tilly/watchlist error:", err);
      res.status(500).json({ error: "watchlist failed" });
    }
  });

  app.post("/api/tilly/watchlist", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no_household" });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 200) {
      return res.status(400).json({ error: "name required (1-200 chars)" });
    }
    const estimatedPrice =
      typeof req.body?.estimatedPrice === "number" && req.body.estimatedPrice > 0
        ? req.body.estimatedPrice
        : null;
    try {
      const [row] = await db
        .insert(watchlistItems)
        .values({
          userId: req.user.id,
          householdId,
          name,
          estimatedPrice,
        })
        .returning();
      res.json({
        item: {
          id: row.id,
          name: row.name,
          estimatedPrice: row.estimatedPrice,
          addedAt: row.addedAt.toISOString(),
        },
      });
    } catch (err) {
      console.error("/api/tilly/watchlist POST error:", err);
      res.status(500).json({ error: "add failed" });
    }
  });

  // PUT instead of PATCH so the existing apiRequest helper (which has
  // putJson but not patchJson) can hit it without extra plumbing.
  app.put(
    "/api/tilly/watchlist/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const id = String(req.params.id);
      const patch: Record<string, unknown> = {};
      if (typeof req.body?.status === "string") {
        const s = req.body.status;
        if (s === "active" || s === "bought" || s === "dropped") {
          patch.status = s;
          if (s !== "active") patch.resolvedAt = new Date();
        }
      }
      if (typeof req.body?.estimatedPrice === "number" && req.body.estimatedPrice > 0) {
        patch.estimatedPrice = req.body.estimatedPrice;
      }
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        patch.name = req.body.name.trim().slice(0, 200);
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "no patchable fields provided" });
      }
      try {
        await db
          .update(watchlistItems)
          .set(patch as any)
          .where(
            and(
              eq(watchlistItems.id, id),
              eq(watchlistItems.householdId, householdId),
            ),
          );
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/tilly/watchlist PATCH error:", err);
        res.status(500).json({ error: "patch failed" });
      }
    },
  );

  app.delete(
    "/api/tilly/watchlist/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const id = String(req.params.id);
      try {
        await db
          .delete(watchlistItems)
          .where(
            and(
              eq(watchlistItems.id, id),
              eq(watchlistItems.householdId, householdId),
            ),
          );
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/tilly/watchlist DELETE error:", err);
        res.status(500).json({ error: "delete failed" });
      }
    },
  );
}
