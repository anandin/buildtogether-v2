/**
 * Subscriptions — spec §4.1 Home tile, §5.7 protective surface.
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { subscriptions } from "../../shared/schema";
import { scanSubscriptions } from "../tilly/subscription-detect";

type WireSub = {
  id: string;
  merchant: string;
  amount: number;
  cadence: string;
  nextChargeAt: string | null;
  lastUsedAt: string | null;
  status: string;
  usageNote: string | null;
};

function toWire(row: typeof subscriptions.$inferSelect): WireSub {
  return {
    id: row.id,
    merchant: row.merchant,
    amount: row.amount,
    cadence: row.cadence,
    nextChargeAt: row.nextChargeAt,
    lastUsedAt: row.lastUsedAt,
    status: row.status,
    usageNote: row.usageNote,
  };
}

export function mountSubscriptionsRoutes(app: Express): void {
  app.get("/api/subscriptions", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: true, subscriptions: [] });

    try {
      const rows = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.householdId, householdId));
      res.json({ ready: true, subscriptions: rows.map(toWire) });
    } catch (err) {
      console.error("/api/subscriptions GET error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  app.get(
    "/api/subscriptions/upcoming",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.json({ ready: true, upcoming: [] });

      try {
        const horizon = new Date(Date.now() + 7 * 86400 * 1000)
          .toISOString()
          .slice(0, 10);
        const rows = await db
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.householdId, householdId),
              eq(subscriptions.status, "active"),
            ),
          );
        const upcoming = rows
          .filter((r) => r.nextChargeAt && r.nextChargeAt <= horizon)
          .sort((a, b) => (a.nextChargeAt ?? "").localeCompare(b.nextChargeAt ?? ""));
        res.json({ ready: true, upcoming: upcoming.map(toWire) });
      } catch (err) {
        console.error("/api/subscriptions/upcoming error:", err);
        res.status(500).json({ error: "upcoming failed" });
      }
    },
  );

  app.post(
    "/api/subscriptions/scan",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });

      try {
        const result = await scanSubscriptions(householdId);
        res.json({ ok: true, ...result });
      } catch (err) {
        console.error("/api/subscriptions/scan error:", err);
        res.status(500).json({ error: "scan failed" });
      }
    },
  );

  app.post(
    "/api/subscriptions/:id/pause",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);

      try {
        const [updated] = await db
          .update(subscriptions)
          .set({ status: "paused", pausedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(subscriptions.id, id), eq(subscriptions.householdId, householdId)),
          )
          .returning();
        if (!updated) return res.status(404).json({ error: "subscription not found" });
        res.json({ subscription: toWire(updated) });
      } catch (err) {
        console.error("/api/subscriptions/:id/pause error:", err);
        res.status(500).json({ error: "pause failed" });
      }
    },
  );

  app.post(
    "/api/subscriptions/:id/resume",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);

      try {
        const [updated] = await db
          .update(subscriptions)
          .set({ status: "active", pausedAt: null, updatedAt: new Date() })
          .where(
            and(eq(subscriptions.id, id), eq(subscriptions.householdId, householdId)),
          )
          .returning();
        if (!updated) return res.status(404).json({ error: "subscription not found" });
        res.json({ subscription: toWire(updated) });
      } catch (err) {
        console.error("/api/subscriptions/:id/resume error:", err);
        res.status(500).json({ error: "resume failed" });
      }
    },
  );

  app.delete(
    "/api/subscriptions/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);

      try {
        const result = await db
          .delete(subscriptions)
          .where(
            and(eq(subscriptions.id, id), eq(subscriptions.householdId, householdId)),
          )
          .returning({ id: subscriptions.id });
        if (!result.length)
          return res.status(404).json({ error: "subscription not found" });
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/subscriptions/:id DELETE error:", err);
        res.status(500).json({ error: "delete failed" });
      }
    },
  );
}
