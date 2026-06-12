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
import {
  goals,
  goalContributions,
  tillyReminders,
  users,
  watchlistItems,
} from "../../shared/schema";
import { runProtectionsAll } from "../tilly/protections-engine";
import { runNotify } from "../tilly/notify-cron";
import { runPatternDetectionAll } from "../tilly/pattern-cron";
import { distillAllActiveUsers } from "../tilly/nightly-distiller";
import { rewriteDossiersForActiveUsers } from "../tilly/dossier-rewriter";
import { archiveStaleMemories } from "../tilly/memory-archiver";
import { sendExpoPush } from "../tilly/expo-push";
import { emitEventAsync } from "../tilly/event-emitter";
import { cityToTimezone, localDateString } from "../tilly/user-tz";
import { asc, isNull, or } from "drizzle-orm";

export function requireCron(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail-closed in production — an unset CRON_SECRET in prod means the
    // operator forgot to set it, and leaving the endpoints open would let
    // anyone trigger LLM-billable cron jobs (distill, dossier, archive).
    if (process.env.NODE_ENV === "production") {
      console.error("CRON_SECRET not set in production — refusing cron request");
      return res.status(503).json({ error: "cron not configured" });
    }
    // In dev / staging: allow through but log loudly so it can't go unnoticed.
    console.warn("CRON_SECRET not set — cron endpoint is open. Set it in env vars.");
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
   * Sprint A — morning watchlist nudge. Runs hourly. For each user
   * whose local hour is currently 9am AND who has ≥1 active watchlist
   * item, pick the oldest item that hasn't been nudged today and send
   * a push notification. Idempotent via lastNudgedAt (compared against
   * the user's local YYYY-MM-DD so a user only ever gets one nudge per
   * local day even if the cron retries).
   *
   * Body templates are kept terse — the goal is to surface the desire
   * back to the user, not to summarise it. The notification opens the
   * app to Today where the ShouldIBuyTile is already mounted.
   */
  app.post(
    "/api/cron/morning-watchlist",
    requireCron,
    async (_req: Request, res: Response) => {
      const startedAt = Date.now();
      const targetHour = 9; // 9am local
      try {
        // Pull active watchlist items + the owning user's city +
        // expoPushToken in one go. Limit to a sane cap; if we ever
        // exceed it the cron should be sharded.
        const rows = await db
          .select({
            itemId: watchlistItems.id,
            itemName: watchlistItems.name,
            itemEstimatedPrice: watchlistItems.estimatedPrice,
            itemAddedAt: watchlistItems.addedAt,
            itemLastNudgedAt: watchlistItems.lastNudgedAt,
            userId: users.id,
            city: users.city,
            expoPushToken: users.expoPushToken,
          })
          .from(watchlistItems)
          .leftJoin(users, eq(users.id, watchlistItems.userId))
          .where(eq(watchlistItems.status, "active"))
          .orderBy(asc(watchlistItems.addedAt))
          .limit(200);

        // Group by user; pick the oldest unnudged-today item.
        type Pick = {
          userId: string;
          tz: string;
          token: string | null;
          item: (typeof rows)[number];
        };
        const picks: Pick[] = [];
        const seenUsers = new Set<string>();
        const now = new Date();
        for (const r of rows) {
          if (!r.userId || seenUsers.has(r.userId)) continue;
          const tz = cityToTimezone(r.city ?? null);
          const localHour = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            hour12: false,
          }).format(now);
          if (parseInt(localHour, 10) !== targetHour) continue;
          // Per-user idempotency: only fire if no item nudged this
          // user's local-today date.
          const todayLocal = localDateString(now, tz);
          if (r.itemLastNudgedAt) {
            const nudgeLocal = localDateString(r.itemLastNudgedAt, tz);
            if (nudgeLocal === todayLocal) {
              seenUsers.add(r.userId); // already nudged today
              continue;
            }
          }
          picks.push({ userId: r.userId, tz, token: r.expoPushToken ?? null, item: r });
          seenUsers.add(r.userId);
        }

        let pushed = 0;
        let pushSkipped = 0;
        for (const p of picks) {
          const name = p.item.itemName;
          const price = p.item.itemEstimatedPrice;
          const body = price
            ? `Still thinking about ${name}? Roughly $${Math.round(price)} — want to check the math?`
            : `Still thinking about ${name}? Tap to talk it through.`;
          if (p.token) {
            const ticket = await sendExpoPush({
              to: p.token,
              title: "Tilly",
              body,
              data: { route: "home", watchlistItemId: p.item.itemId },
            });
            if (ticket?.status === "ok") pushed += 1;
            else pushSkipped += 1;
          } else {
            pushSkipped += 1;
          }
          // Always bump lastNudgedAt — even if the push failed, we
          // shouldn't retry the same item in the same hour-window.
          await db
            .update(watchlistItems)
            .set({ lastNudgedAt: new Date() })
            .where(eq(watchlistItems.id, p.item.itemId));
        }

        res.json({
          ok: true,
          considered: rows.length,
          eligible: picks.length,
          pushed,
          pushSkipped,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron] morning-watchlist failed:", msg);
        res.status(500).json({ error: "morning-watchlist failed", debug: msg });
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

  // Payday Pulse — hourly. Detects a paycheck that landed today (or
  // yesterday, for late Plaid posts) on the cadence-clean income set,
  // computes the cycle allocation (bills due before the next paycheck +
  // expected variable burn → "truly yours"), and sends ONE push with
  // the split inline. Idempotent per (user, paydayDate); daytime-gated
  // 8am-9pm local. Runs at :47 so the :17 plaid-sync-all lands first.
  app.post(
    "/api/cron/payday-pulse",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { runPaydayPulseAll } = await import("../tilly/payday-brief");
        const r = await runPaydayPulseAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/payday-pulse error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "payday-pulse cron failed", debug: msg });
      }
    },
  );

  // Engagement loop — hourly. Four outbound surfaces, each internally
  // gated by local time + idempotency: morning brief (8am, delta-gated),
  // weekly review (Sun 6pm), category cap alerts (80%/100%), mid-cycle
  // pace correction (noon, ≥7 days into a pay cycle), plus the Monday
  // watchlist price scout. See tilly/engagement-cron.ts.
  app.post(
    "/api/cron/engagement-loop",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { runEngagementLoopAll } = await import("../tilly/engagement-cron");
        const r = await runEngagementLoopAll();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/engagement-loop error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "engagement-loop cron failed", debug: msg });
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

  // Memory archiver — soft-archives stale tilly_memory rows so the
  // retriever's last-500 window stays focused on recent context. Honors
  // each user's memoryRetention pref (forever | 1y | 90d) and never
  // archives commitment / value kinds. Runs daily at 04:00 UTC via the
  // in-process scheduler; this endpoint exists for manual / external
  // triggering and parity with the other memory crons.
  app.post(
    "/api/cron/archive-memories",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const r = await archiveStaleMemories();
        res.json({ ok: true, ...r });
      } catch (err) {
        console.error("/api/cron/archive-memories error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "archive cron failed", debug: msg });
      }
    },
  );

  // Smart Tilly #11 — record predicted close + accept variants for the
  // current month every day, so by month-end we have a snapshot of the
  // last projection. Idempotent upsert keyed on (household, month).
  app.post(
    "/api/cron/record-projection-history",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { recordProjectionForAll } = await import(
          "../tilly/projection-history"
        );
        const out = await recordProjectionForAll();
        res.json({ ok: true, ...out });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("/api/cron/record-projection-history error:", msg);
        res.status(500).json({ error: "record cron failed", debug: msg });
      }
    },
  );

  // Self-learning skill induction — scans the last 7 days of successful
  // tool trajectories and extracts reusable skills (Hermes/Voyager
  // pattern). Proposed skills land in tilly_skills with status='proposed'
  // for admin review at /admin/skills. Run weekly Sunday 4am UTC.
  app.post(
    "/api/cron/induce-skills",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { induceSkillsFromTrajectories } = await import("../tilly/skills");
        const out = await induceSkillsFromTrajectories();
        res.json({ ok: true, ...out });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("/api/cron/induce-skills error:", msg);
        res.status(500).json({ error: "induction failed", debug: msg });
      }
    },
  );

  // Skill curator — promotes proposed skills with positive usage,
  // archives underperforming active skills. Hermes cadence: 7 days.
  app.post(
    "/api/cron/curate-skills",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { curateSkills } = await import("../tilly/skills");
        const out = await curateSkills();
        res.json({ ok: true, ...out });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("/api/cron/curate-skills error:", msg);
        res.status(500).json({ error: "curation failed", debug: msg });
      }
    },
  );

  // Smart Tilly #11 — at the start of each month, settle the prior
  // month: compute actual close from the now-final ledger and stamp
  // settled_at on the matching projection_history row. The detector
  // reads (predicted - actual) to surface accuracy.
  app.post(
    "/api/cron/settle-projection-history",
    requireCron,
    async (_req: Request, res: Response) => {
      try {
        const { settleProjectionsForAll } = await import(
          "../tilly/projection-history"
        );
        const out = await settleProjectionsForAll();
        res.json({ ok: true, ...out });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("/api/cron/settle-projection-history error:", msg);
        res.status(500).json({ error: "settle cron failed", debug: msg });
      }
    },
  );
}
