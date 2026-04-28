/**
 * Tilly memory inspector — spec §4.6 timeline + §5.4 trust contract.
 *
 * The memory pill (top-right of Guardian chat) opens a transparent view of
 * everything Tilly has remembered, in her own words. The user can:
 *   - GET     /api/tilly/memory          — list (active or with archived)
 *   - POST    /api/tilly/memory/:id/forget — archive a single note
 *   - GET     /api/tilly/memory/export   — markdown bundle
 *   - DELETE  /api/tilly/memory          — full purge (with confirmation)
 *
 * Phase 2 fills this from the `tilly_memory` table.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth";

export function mountTillyMemoryRoutes(app: Express): void {
  app.get("/api/tilly/memory", requireAuth, async (_req: Request, res: Response) => {
    // Phase 2: SELECT FROM tilly_memory WHERE user_id=? AND archived_at IS NULL
    //          ORDER BY noticed_at DESC
    res.json({ memory: [] });
  });

  app.post("/api/tilly/memory/:id/forget", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 2", phase: 2 });
  });

  app.get("/api/tilly/memory/export", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 2", phase: 2 });
  });

  app.delete("/api/tilly/memory", requireAuth, async (_req: Request, res: Response) => {
    res.status(501).json({ error: "Phase 2", phase: 2 });
  });
}
