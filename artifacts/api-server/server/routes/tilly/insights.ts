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
import { buildWeeklyPattern } from "../../tilly/spend-pattern";
import { buildCreditSnapshot } from "../../tilly/credit-snapshot";
import { sql } from "drizzle-orm";
import { expenses, plaidTransactions } from "../../../shared/schema";

/**
 * Compute breathing-room from any transaction source we have — Plaid +
 * manual expenses unioned. Heuristic: $320 weekly allowance, subtract
 * this-week's spend. Returns null only if both sources are completely
 * empty so the screen falls back to its connect-bank state.
 *
 * Once Plaid liabilities + paycheck cadence land, this gets replaced by
 * a real cash-flow calculation; for now the heuristic is enough to flip
 * Home off the empty state and into something the user can see numbers
 * change as they log activity.
 */
async function estimateFromTransactions(
  householdId: string,
): Promise<{ breathing: number; afterRent: number; paycheckCopy: string } | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [manual, plaid] = await Promise.all([
    db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(sql`${expenses.coupleId} = ${householdId} AND ${expenses.date} >= ${sevenDaysAgo} AND ${expenses.amount} > 0`),
    db
      .select({ amount: plaidTransactions.amount })
      .from(plaidTransactions)
      .where(sql`${plaidTransactions.coupleId} = ${householdId} AND ${plaidTransactions.date} >= ${sevenDaysAgo} AND ${plaidTransactions.amount} > 0`),
  ]);
  if (manual.length === 0 && plaid.length === 0) return null;
  const weekSpent = Math.round(
    manual.reduce((s, r) => s + r.amount, 0) + plaid.reduce((s, r) => s + r.amount, 0),
  );
  // Auto-scale the heuristic allowance to the user's actual spend pattern.
  // For a student with $320/wk in expenses we land near design's $312
  // breathing-room number; for Plaid sandbox accounts that have larger
  // synthetic transactions the allowance scales up so we don't constantly
  // report 0 breathing (which is technically correct but useless UX). Real
  // Plaid path will replace this with paycheck cadence + bills math once
  // production access lands.
  const weeklyAllowance = Math.max(320, Math.round(weekSpent * 1.25));
  const breathing = Math.max(0, weeklyAllowance - weekSpent);
  const source =
    plaid.length > 0 && manual.length > 0
      ? "your bank + manual logs"
      : plaid.length > 0
      ? "your bank"
      : "your manual logs";
  return {
    breathing,
    afterRent: breathing,
    paycheckCopy: `$${weekSpent} this week · estimate from ${source}`,
  };
}

/**
 * Deterministic fallback brief when the LLM is unavailable. Mirrors the
 * client's tone greeter so the user gets a coherent home even when
 * OpenRouter is down or unconfigured.
 */
function deterministicBrief(
  name: string,
  tone: BTToneKey,
  numbers: { breathing: number; afterRent: number; paycheckCopy: string },
  dreamTile?: { name: string; autoSaveCopy: string; saved: number; target: number },
) {
  const first = name.split(" ")[0] || "there";
  const greetByTone: Record<BTToneKey, string> = {
    sibling: `Hey ${first}.`,
    coach: `Morning, ${first}.`,
    quiet: `${first},`,
  };
  const inviteByTone: Record<BTToneKey, string> = {
    sibling: "Anything you want to think through?",
    coach: "What's the one thing you want to move today?",
    quiet: "Tell me what's on your mind.",
  };
  const now = new Date();
  const dayLabel = now.toLocaleDateString("en-US", { weekday: "long" }) +
    (now.getHours() < 12 ? " morning" : ` · ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase()}`);
  return {
    greeting: greetByTone[tone],
    dayLabel,
    breathing: numbers.breathing,
    afterRent: numbers.afterRent,
    paycheckCopy: numbers.paycheckCopy,
    dreamTile,
    tillyInvite: inviteByTone[tone],
  };
}

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

      // Compute breathing-room from any transaction source — Plaid +
      // manual expenses unioned. Falls through to the empty-state
      // copy only when both sources are completely empty.
      const fromTx = await estimateFromTransactions(householdId);
      const numbers = fromTx ?? {
        breathing: 0,
        afterRent: 0,
        paycheckCopy: plaidConnected
          ? "Calculating paycheck cadence…"
          : "Connect a bank to see your weekly room",
      };

      // Try LLM-generated copy. When it fails (no key, rate-limit, transient
      // upstream error) we degrade to a deterministic greeting+invite so the
      // user always sees a coherent home, never a 500. The screen treats
      // ready:true with afterRent=0 as the connect-bank empty state already.
      let brief: Awaited<ReturnType<typeof buildDailyBrief>>;
      try {
        brief = await buildDailyBrief({
          userId,
          householdId,
          name,
          tone,
          now: new Date().toISOString(),
          numbers,
          dreamTile,
          recentMemorySnippets: snippets,
        });
      } catch (llmErr) {
        console.warn("/api/tilly/today llm fallback:", llmErr);
        brief = deterministicBrief(name, tone, numbers, dreamTile);
      }

      res.json({
        ready: true,
        ...brief,
      });
    } catch (err) {
      console.error("/api/tilly/today error:", err);
      // Even the fall-through DB read failed — give the client a structured
      // ready:false so the screen renders its empty state instead of a 500.
      res.json({ phase: 2, ready: false, reason: "transient" });
    }
  });

  app.get("/api/tilly/spend-pattern", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ phase: 4, ready: false });

    try {
      const pattern = await buildWeeklyPattern(householdId);
      if (!pattern) return res.json({ phase: 4, ready: false });
      res.json(pattern);
    } catch (err) {
      // Plaid not connected, no transactions, or transient DB read — same UX
      // either way: the screen renders its connect-bank empty state. We
      // return ready:false instead of 500 so the browser console stays clean.
      console.warn("/api/tilly/spend-pattern soft-fail:", err);
      res.json({ phase: 4, ready: false, reason: "transient" });
    }
  });

  app.get("/api/tilly/credit-snapshot", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ phase: 4, ready: false });

    try {
      const snap = await buildCreditSnapshot(householdId);
      res.json(snap);
    } catch (err) {
      // Same soft-fail pattern as spend-pattern.
      console.warn("/api/tilly/credit-snapshot soft-fail:", err);
      res.json({ phase: 4, ready: false, reason: "transient" });
    }
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
