/**
 * Tilly insight projections — feed the BT screens.
 *
 *   GET /api/tilly/today          → BTHome hero ("$312 of breathing room")
 *   GET /api/tilly/spend-pattern  → BTSpend headline + day bars + categories
 *   GET /api/tilly/credit-snapshot→ BTCredit utilization + protections
 *   GET /api/tilly/profile        → BTProfile pair, tone, daysWithTilly
 *
 * Each one is a read-model projection over the layered architecture:
 *   Observation (Plaid feed, chat, actions) →
 *   Ledger (balances, recurring tx, dreams)  →
 *   Surfacing (these endpoints)              → BT screen.
 *
 * Phase 2 fills `today` + `profile`. Phase 4 fills `spend-pattern` +
 * `credit-snapshot`.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth";

export function mountTillyInsightsRoutes(app: Express): void {
  app.get("/api/tilly/today", requireAuth, async (_req: Request, res: Response) => {
    // Phase 2 returns:
    //   {
    //     greeting, dayLabel, breathing, afterRent, paycheckCopy,
    //     subscriptionTile?, dreamTile?, tillyInvite,
    //   }
    res.json({ phase: 2, ready: false });
  });

  app.get("/api/tilly/spend-pattern", requireAuth, async (_req: Request, res: Response) => {
    // Phase 4 returns:
    //   { spent, headline, bars: BTDayBar[], categories: BTSpendCategory[],
    //     today: BTRecent[], paycheck: { amount, source, day } }
    res.json({ phase: 4, ready: false });
  });

  app.get("/api/tilly/credit-snapshot", requireAuth, async (_req: Request, res: Response) => {
    // Phase 4: derive utilization from Plaid liabilities. VantageScore deferred per D3.
    res.json({ phase: 4, ready: false });
  });

  app.get("/api/tilly/profile", requireAuth, async (_req: Request, res: Response) => {
    // Phase 2: returns name, school, daysWithTilly, tone preview, trusted people, quietSettings.
    res.json({ phase: 2, ready: false });
  });
}
