/**
 * Protections — spec §5.7 protective surface.
 *
 * Single feed for everything Tilly is watching: phishing texts, free trials
 * about to convert, unused subscriptions, unusual charges. Two surfaces
 * read from this:
 *   - BTHome subscription tile (filter: kind=unused_sub, severity≥decision_needed)
 *   - BTCredit "Tilly protected you · 24h" card (filter: last 24h, all kinds)
 *
 * Phase 4 lights up unused_sub. Phase 5 lights up phishing + free_trial.
 */
import type { Express, Request, Response } from "express";
import { eq, and, gte } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { protections, subscriptions } from "../../shared/schema";
import { runProtectionScan } from "../tilly/protect";

function toWire(row: typeof protections.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    summary: row.summary,
    detail: row.detail,
    ctaLabel: row.ctaLabel,
    ctaAction: row.ctaAction,
    ctaTargetId: row.ctaTargetId,
    flaggedAt: row.flaggedAt.toISOString(),
    status: row.status,
  };
}

export function mountProtectionsRoutes(app: Express): void {
  app.get("/api/protections", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: true, protections: [] });

    try {
      const rows = await db
        .select()
        .from(protections)
        .where(eq(protections.householdId, householdId));
      res.json({ ready: true, protections: rows.map(toWire) });
    } catch (err) {
      console.error("/api/protections error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  app.get(
    "/api/protections/recent",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.json({ ready: true, protections: [] });

      try {
        const since = new Date(Date.now() - 24 * 86400 * 1000);
        const rows = await db
          .select()
          .from(protections)
          .where(
            and(
              eq(protections.householdId, householdId),
              gte(protections.flaggedAt, since),
            ),
          );
        res.json({ ready: true, protections: rows.map(toWire) });
      } catch (err) {
        console.error("/api/protections/recent error:", err);
        res.status(500).json({ error: "list failed" });
      }
    },
  );

  app.post(
    "/api/protections/scan",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      try {
        const result = await runProtectionScan(householdId);
        res.json({ ok: true, ...result });
      } catch (err) {
        console.error("/api/protections/scan error:", err);
        res.status(500).json({ error: "scan failed" });
      }
    },
  );

  app.post(
    "/api/protections/:id/dismiss",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);
      try {
        const [updated] = await db
          .update(protections)
          .set({ status: "dismissed", dismissedAt: new Date() })
          .where(
            and(eq(protections.id, id), eq(protections.householdId, householdId)),
          )
          .returning();
        if (!updated) return res.status(404).json({ error: "protection not found" });
        res.json({ protection: toWire(updated) });
      } catch (err) {
        console.error("/api/protections/:id/dismiss error:", err);
        res.status(500).json({ error: "dismiss failed" });
      }
    },
  );

  // Perform the CTA (e.g. pause the linked subscription).
  app.post(
    "/api/protections/:id/act",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);
      try {
        const [prot] = await db
          .select()
          .from(protections)
          .where(
            and(eq(protections.id, id), eq(protections.householdId, householdId)),
          );
        if (!prot) return res.status(404).json({ error: "protection not found" });

        if (prot.ctaAction === "pause_subscription" && prot.ctaTargetId) {
          await db
            .update(subscriptions)
            .set({ status: "paused", pausedAt: new Date() })
            .where(eq(subscriptions.id, prot.ctaTargetId));
        }

        const [updated] = await db
          .update(protections)
          .set({ status: "acted", actedAt: new Date() })
          .where(eq(protections.id, id))
          .returning();
        res.json({ protection: toWire(updated) });
      } catch (err) {
        console.error("/api/protections/:id/act error:", err);
        res.status(500).json({ error: "act failed" });
      }
    },
  );
}
