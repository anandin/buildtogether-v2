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
import { requireAuth } from "../middleware/auth";

export function mountProtectionsRoutes(app: Express): void {
  app.get("/api/protections", requireAuth, async (_req: Request, res: Response) => {
    res.json({ protections: [], phase: 4, ready: false });
  });

  app.get("/api/protections/recent", requireAuth, async (_req: Request, res: Response) => {
    // last 24h — feeds the Credit "protected you" card
    res.json({ protections: [], phase: 4, ready: false });
  });

  app.post("/api/protections/:id/dismiss", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });

  app.post("/api/protections/:id/act", requireAuth, async (_req: Request, res: Response) => {
    // Performs the CTA (e.g. pause subscription). Returns the resulting state.
    res.status(501).json({ error: "Phase 4", phase: 4 });
  });
}
