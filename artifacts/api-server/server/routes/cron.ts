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
import { goals, goalContributions, tillyReminders, users } from "../../shared/schema";
import { runProtectionsAll } from "../tilly/protections-engine";
import { runNotify } from "../tilly/notify-cron";
import { runPatternDetectionAll } from "../tilly/pattern-cron";
import { distillAllActiveUsers } from "../tilly/nightly-distiller";
import { rewriteDossiersForActiveUsers } from "../tilly/dossier-rewriter";
import { sendExpoPush } from "../tilly/expo-push";
import { emitEventAsync } from "../tilly/event-emitter";

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
   * Reminder UX S6 — fire scheduled reminders that have passed their
   * fireAt. For each due reminder:
   *   - Look up the user's expoPushToken
   *   - Send a Tilly-voice push notification (no-op if no token)
   *   - Mark the reminder fired (regardless of push outcome — we don't
   *     want a dead token to keep the reminder pending forever)
   *   - Emit reminder_fired event
   *
   * Tight cap (50 reminders per tick) so a backlog doesn't blow the
   * function timeout. Vercel cron at every-minute granularity will
   * drain a queue quickly enough; if it ever exceeds 50/min we have
   * other problems.
   */
  app.post(
    "/api/cron/fire-reminders",
    requireCron,
    async (_req: Request, res: Response) => {
      const startedAt = Date.now();
      try {
        const now = new Date();
        const due = await db
          .select()
          .from(tillyReminders)
          .where(
            and(
              eq(tillyReminders.status, "scheduled"),
              sql`${tillyReminders.fireAt} <= ${now.toISOString()}`,
            ),
          )
          .limit(50);
        if (due.length === 0) {
          return res.json({ ok: true, fired: 0, durationMs: Date.now() - startedAt });
        }
        // Pull push tokens for the involved users in one query.
        const userIds = Array.from(new Set(due.map((r) => r.userId)));
        const userRows = await db
          .select({ id: users.id, expoPushToken: users.expoPushToken })
          .from(users)
          .where(sql`${users.id} = ANY(${userIds})`);
        const tokenById = new Map(userRows.map((u) => [u.id, u.expoPushToken]));
        let pushed = 0;
        let pushSkipped = 0;
        for (const r of due) {
          const token = tokenById.get(r.userId);
          if (token) {
            const ticket = await sendExpoPush({
              to: token,
              title: "Tilly",
              body: r.label,
              data: { reminderId: r.id, kind: r.kind },
            });
            if (ticket?.status === "ok") pushed += 1;
            else pushSkipped += 1;
          } else {
            pushSkipped += 1;
          }
          await db
            .update(tillyReminders)
            .set({ status: "fired", firedAt: new Date() })
            .where(eq(tillyReminders.id, r.id));
          emitEventAsync({
            userId: r.userId,
            householdId: r.householdId,
            kind: "reminder_fired",
            payload: {
              reminderId: r.id,
              hadPushToken: !!token,
              label: r.label,
            },
            sourceTable: "tilly_reminders",
            sourceId: r.id,
          });
        }
        res.json({
          ok: true,
          fired: due.length,
          pushed,
          pushSkipped,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron] fire-reminders failed:", msg);
        res.status(500).json({ error: "fire-reminders failed", debug: msg });
      }
    },
  );

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
        const r = await runProtectionsAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/protections error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "protections cron failed", debug: msg });
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
        const r = await runNotify();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/notify error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "notify cron failed", debug: msg });
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
        const r = await runPatternDetectionAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/patterns error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "pattern cron failed", debug: msg });
      }
    },
  );

  // S2 — nightly memory distiller. Reads last-24h of tilly_events for
  // every active user and produces typed L2 memories in tilly_memory_v2.
  // Schedules nightly at 03:00 UTC (~10pm Eastern, 7pm Pacific) — after
  // the day's chat traffic but before any morning push nudges.
  app.post(
    "/api/cron/distill-memories",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const r = await distillAllActiveUsers(since);
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/distill-memories error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "distiller cron failed", debug: msg });
      }
    },
  );

  // S3 — nightly dossier rewriter. Runs after the distiller (at 03:30
  // UTC) so it sees today's freshly-distilled typed memories.
  app.post(
    "/api/cron/rewrite-dossiers",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const r = await rewriteDossiersForActiveUsers(since);
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/rewrite-dossiers error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "dossier cron failed", debug: msg });
      }
    },
  );
}
