/**
 * Cron endpoints — invoked by Vercel Cron (vercel.json).
 *
 *   POST /api/cron/auto-save     — Friday 9am UTC: processes weekly dream
 *                                   auto-saves for all households
 *   POST /api/cron/protections   — Daily noon UTC: refreshes the
 *                                   protections feed (Phase 4 wires this)
 *   POST /api/cron/notify        — Daily noon UTC: pushes act-today to
 *                                   users respecting quiet hours (Phase 5)
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. We
 * validate that header before doing any work. Set CRON_SECRET in
 * Vercel env vars.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { eq, and, gt, sql } from "drizzle-orm";

import { db } from "../db";
import { goals, goalContributions } from "../../shared/schema";

function requireCron(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret set → allow in dev, but log loudly.
    console.warn("CRON_SECRET not set — cron endpoint is open. Set it in Vercel env vars.");
    return next();
  }
  const auth = req.header("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "cron auth required" });
  }
  next();
}

export function mountCronRoutes(app: Express): void {
  /**
   * Process weekly dream auto-saves. Spec D4: "+$40 moves Friday" should
   * actually move on Friday.
   *
   * Phase 3b (this implementation): internal accounting only. Adds a
   * `goal_contributions` row with contributor='auto' and bumps
   * `goals.saved_amount`. Phase 6 wires this to Plaid Transfer for actual
   * bank-side movement once Plaid Transfer is enabled on the deployment.
   *
   * Idempotency: skips dreams that already received an auto contribution
   * in the last 6 days. The cron fires weekly; if it runs twice in the
   * same week (manual + scheduled), the dream still only gets one bump.
   */
  app.post(
    "/api/cron/auto-save",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const dueRows = await db
          .select()
          .from(goals)
          .where(and(gt(goals.weeklyAuto, 0)));

        let processed = 0;
        let skipped = 0;
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 6 * 86400 * 1000).toISOString().slice(0, 10);

        for (const dream of dueRows) {
          // Skip if a recent auto contribution exists.
          const recentAuto = await db
            .select({ id: goalContributions.id })
            .from(goalContributions)
            .where(
              and(
                eq(goalContributions.goalId, dream.id),
                eq(goalContributions.contributor, "auto"),
                sql`${goalContributions.date} > ${weekAgo}`,
              ),
            )
            .limit(1);
          if (recentAuto.length) {
            skipped++;
            continue;
          }

          const amount = dream.weeklyAuto ?? 0;
          if (amount <= 0) {
            skipped++;
            continue;
          }

          await db.transaction(async (tx) => {
            await tx.insert(goalContributions).values({
              goalId: dream.id,
              amount,
              date: today,
              contributor: "auto",
            });
            await tx
              .update(goals)
              .set({ savedAmount: dream.savedAmount + amount })
              .where(eq(goals.id, dream.id));
          });
          processed++;
        }

        res.json({ ok: true, processed, skipped, totalDue: dueRows.length });
      } catch (err) {
        console.error("/api/cron/auto-save error:", err);
        res.status(500).json({ error: "cron failed" });
      }
    },
  );

  // Sweeps the protections engine over every household. Vercel Cron hits
  // this hourly; the dedupe window inside the engine keeps it idempotent.
  app.post(
    "/api/cron/protections",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { runProtectionsAll } = await import("../tilly/protections-engine");
        const r = await runProtectionsAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/protections error:", err);
        res.status(500).json({ error: "protections cron failed" });
      }
    },
  );

  // Fan-out cron — finds protections with severity 'act_today' that
  // haven't been pushed yet, sends a push to every active token, marks
  // them as 'pushed'. Quiet hours respected.
  app.post(
    "/api/cron/notify",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { runNotify } = await import("../tilly/notify-cron");
        const r = await runNotify();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/notify error:", err);
        res.status(500).json({ error: "notify cron failed" });
      }
    },
  );

  // Pattern detection cron — runs weekly. Captures repeating soft-spot
  // patterns into tilly_observations rows so the Tilly Learned card can
  // surface them. Currently a thin wrapper around buildWeeklyPattern;
  // future versions will identify multi-week recurrence beyond the
  // current sigma test.
  app.post(
    "/api/cron/patterns",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { runPatternDetectionAll } = await import("../tilly/pattern-cron");
        const r = await runPatternDetectionAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/patterns error:", err);
        res.status(500).json({ error: "pattern cron failed" });
      }
    },
  );
}
