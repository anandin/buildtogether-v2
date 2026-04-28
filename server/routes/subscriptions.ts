/**
 * Subscriptions — spec §4.1 Home tile, §5.7 protective surface.
 *
 * Detection from Plaid recurring-transactions endpoint (and rule-based
 * fallback) lands rows in the `subscriptions` table. Tilly's "renews
 * tomorrow · used twice in 30 days" copy comes from the joined view here.
 *
 * Phase 4 implements:
 *   - GET /api/subscriptions               — full list
 *   - GET /api/subscriptions/upcoming      — within next 7 days
 *   - POST /api/subscriptions/scan         — trigger detection from Plaid
 *   - POST /api/subscriptions/:id/pause    — pause flow
 *   - POST /api/subscriptions/:id/resume   — undo pause
 *   - DELETE /api/subscriptions/:id        — cancel + write protection if user requests
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

export function mountSubscriptionsRoutes(app: Express): void {
  app.get("/api/subscriptions", requireAuth, async (_req: Request, res: Response) => {
    res.json({ subscriptions: [], phase: 4, ready: false });
  });

  app.get("/api/subscriptions/upcoming", requireAuth, async (_req: Request, res: Response) => {
    res.json({ upcoming: [], phase: 4, ready: false });
  });

  app.post("/api/subscriptions/scan", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });

  app.post("/api/subscriptions/:id/pause", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });

  app.post("/api/subscriptions/:id/resume", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });

  app.delete("/api/subscriptions/:id", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });
}
