/**
 * Tilly insight projections — feed the BT screens.
 *
 *   GET /api/tilly/today          → BTHome hero ("$312 of breathing room")
 *   GET /api/tilly/spend-pattern  → BTSpend headline + day bars + categories
 *   GET /api/tilly/credit-snapshot→ BTCredit utilization + protections
 *   GET /api/tilly/profile        → BTProfile pair, tone, daysWithTilly
 *
 * Phase 2 lights up `today` (Claude-generated greeting + tilly invite) and
 * `profile` (deterministic). Phase 4 fills `spend-pattern` and
 * `credit-snapshot` once Plaid liabilities are wired.
 */
import type { Express, Request, Response } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import {
  users,
  households,
  plaidItems,
  tillyMemory,
  tillyTonePref,
  goals,
  members,
} from "../../../shared/schema";
import { buildDailyBrief } from "../../tilly/daily-brief";
import { isValidTone, DEFAULT_TONE, type BTToneKey } from "../../tilly/tone";

/**
 * Resolve the user's effective tone — tilly_tone_pref row if present, else default.
 * Phase 2: reads from DB; safe to call before pref is set (returns sibling).
 */
async function resolveTone(userId: string): Promise<BTToneKey> {
  const pref = await db.query.tillyTonePref.findFirst({
    where: eq(tillyTonePref.userId, userId),
  });
  if (pref && isValidTone(pref.tone)) return pref.tone;
  return DEFAULT_TONE;
}

/**
 * Pull the latest 3 active memory snippets so Tilly can be specific in the
 * greeting / invite. Falls back to empty list for new users.
 */
async function recentMemorySnippets(userId: string, limit = 3): Promise<string[]> {
  const rows = await db
    .select({ body: tillyMemory.body })
    .from(tillyMemory)
    .where(and(eq(tillyMemory.userId, userId), isNull(tillyMemory.archivedAt)))
    .orderBy(desc(tillyMemory.noticedAt))
    .limit(limit);
  return rows.map((r) => r.body);
}

/**
 * Best-active dream tile — most progressed goal that still has room to grow.
 * Returns undefined if user has no dreams yet.
 */
async function bestDreamTile(householdId: string) {
  const dreamRows = await db
    .select()
    .from(goals)
    .where(eq(goals.coupleId, householdId)) // legacy column name; renamed in Phase 1c
    .limit(20);
  if (!dreamRows.length) return undefined;
  // Pick the one closest to a 25/50/75 milestone (most narrative pull).
  const ranked = dreamRows
    .map((d) => {
      const pct = (d.savedAmount / d.targetAmount) * 100;
      const milestone = [25, 50, 75].reduce((best, m) =>
        Math.abs(pct - m) < Math.abs(pct - best) ? m : best,
      );
      return { d, distanceToMilestone: Math.abs(pct - milestone) };
    })
    .sort((a, b) => a.distanceToMilestone - b.distanceToMilestone);
  const top = ranked[0]?.d;
  if (!top) return undefined;
  const weekly = top.weeklyAuto ?? 0;
  return {
    name: top.name,
    autoSaveCopy: weekly > 0 ? `+$${weekly.toFixed(0)} ${top.dueLabel ?? "Friday"}` : "Manual saves",
    saved: top.savedAmount,
    target: top.targetAmount,
  };
}

export function mountTillyInsightsRoutes(app: Express): void {
  app.get("/api/tilly/today", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const householdId = req.user.coupleId;

    if (!householdId) {
      // No household — onboarding hasn't completed.
      return res.json({ phase: 2, ready: false, reason: "no_household" });
    }

    try {
      // Phase 2 numeric fields: zeros if Plaid not yet connected; the BTHome
      // screen falls back to BT_DATA mocks for unset values. Phase 4 wires
      // the real Plaid-driven numbers (balance after rent, paycheck cadence,
      // upcoming bills) — until then, the GREETING is the real signal here.
      const plaidConnected = (
        await db.select({ id: plaidItems.id }).from(plaidItems).where(eq(plaidItems.coupleId, householdId)).limit(1)
      ).length > 0;

      const [user, household] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, userId) }),
        db.query.households.findFirst({ where: eq(households.id, householdId) }),
      ]);
      const name = user?.name ?? household?.partner1Name ?? "there";

      const [tone, snippets, dreamTile] = await Promise.all([
        resolveTone(userId),
        recentMemorySnippets(userId),
        bestDreamTile(householdId),
      ]);

      // Phase 2 numbers: zero (frontend will fall back to BT_DATA mock until
      // Phase 4 lights up real Plaid-driven calculation).
      const numbers = {
        breathing: 0,
        afterRent: 0,
        paycheckCopy: plaidConnected
          ? "Calculating paycheck cadence…"
          : "Connect a bank to see your weekly room",
      };

      const brief = await buildDailyBrief({
        userId,
        householdId,
        name,
        tone,
        now: new Date().toISOString(),
        numbers,
        dreamTile,
        recentMemorySnippets: snippets,
      });

      res.json({
        ready: true,
        ...brief,
      });
    } catch (err) {
      console.error("/api/tilly/today error:", err);
      res.status(500).json({ error: "today brief failed", phase: 2 });
    }
  });

  app.get("/api/tilly/spend-pattern", requireAuth, async (_req: Request, res: Response) => {
    res.json({ phase: 4, ready: false });
  });

  app.get("/api/tilly/credit-snapshot", requireAuth, async (_req: Request, res: Response) => {
    res.json({ phase: 4, ready: false });
  });

  app.get("/api/tilly/profile", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: false, reason: "no_household" });

    try {
      const [user, household, tone, memberRows] = await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, userId) }),
        db.query.households.findFirst({ where: eq(households.id, householdId) }),
        resolveTone(userId),
        db.select().from(members).where(eq(members.coupleId, householdId)),
      ]);

      const trusted = memberRows
        .filter((m) => m.role !== "owner")
        .map((m) => ({
          id: m.id,
          name: m.name,
          rel: m.role,
          scope: m.scope ?? m.role,
          hue: m.color === "warn" ? "warn" : m.color === "accent2" ? "accent2" : "accent",
        }));

      const daysWithTilly = household?.connectedSince
        ? Math.max(
            1,
            Math.floor(
              (Date.now() - new Date(household.connectedSince).getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 1;

      res.json({
        ready: true,
        name: user?.name ?? "You",
        school: household?.schoolShort ?? household?.schoolName ?? null,
        studentRole: household?.studentRole ?? null,
        daysWithTilly,
        tone,
        trusted,
      });
    } catch (err) {
      console.error("/api/tilly/profile error:", err);
      res.status(500).json({ error: "profile failed", phase: 2 });
    }
  });
}
