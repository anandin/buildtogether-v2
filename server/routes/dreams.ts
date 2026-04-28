/**
 * Dreams — spec §4.5 goal portraits.
 *
 * BT-shaped dreams (gradient header, oversized glyph, weekly auto-save,
 * Tilly nudge copy). The `goals` table was extended in
 * `migrations/0001_student_edition_pivot.sql` with the BT fields; this
 * router uses them while keeping the V1 `coupleId` column name (Phase 1c
 * renames per-router).
 *
 * Phase 3 implements:
 *   - GET /api/dreams                 — list, with progress + milestone status
 *   - POST /api/dreams                — create
 *   - PUT /api/dreams/:id             — edit
 *   - DELETE /api/dreams/:id          — remove
 *   - POST /api/dreams/:id/contribute — manual contribution
 *   - POST /api/dreams/:id/auto-save  — set up Plaid Transfer auto-debit (D4)
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

export function mountDreamsRoutes(app: Express): void {
  app.get("/api/dreams", requireAuth, async (_req: Request, res: Response) => {
    res.json({ dreams: [], yearSaved: 0, perDay: 0, phase: 3, ready: false });
  });

  app.post("/api/dreams", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 3", phase: 3 });
  });

  app.put("/api/dreams/:id", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 3", phase: 3 });
  });

  app.delete("/api/dreams/:id", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 3", phase: 3 });
  });

  app.post("/api/dreams/:id/contribute", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 3", phase: 3 });
  });

  app.post("/api/dreams/:id/auto-save", requireAuth, async (_req: Request, res: Response) => {
    // D4: full Plaid Transfer auto-debit, scheduled to fire after each paycheck.
    res.status(501).json({ error: "Phase 3 — Plaid Transfer auto-debit", phase: 3 });
  });
}
