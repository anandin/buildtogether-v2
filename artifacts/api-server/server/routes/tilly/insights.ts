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
  plaidTransactions,
  tillyMemory,
  tillyTonePref,
  goals,
  members,
  userPreferences,
} from "../../../shared/schema";
import { gte } from "drizzle-orm";
import { executeTool, type ToolName, TOOL_NAMES } from "../../tilly/tools/registry";
import { buildDailyBrief } from "../../tilly/daily-brief";
import { isValidTone, DEFAULT_TONE, type BTToneKey } from "../../tilly/tone";
import { buildWeeklyPattern } from "../../tilly/spend-pattern";
import { buildCreditSnapshot } from "../../tilly/credit-snapshot";
import { sql } from "drizzle-orm";
import { expenses } from "../../../shared/schema";

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

      // Anchor the hero on monthly math instead of the legacy weekly
      // heuristic (`weeklyAllowance = max(320, weekSpent * 1.25)` was
      // arbitrary). `breathing` now means MONTH surplus (income − spent
      // − committed); `paycheckCopy` is the income/spent/committed
      // breakdown. Existing mobile keys unchanged so the old hero
      // still renders something coherent while SS8 refactors the card.
      const { getMonthlyIncome } = await import("../../tilly/income-summary");
      const { forecastNextNDays } = await import("../../tilly/forecast");
      const { localDateString, getUserTimezone } = await import("../../tilly/user-tz");
      const tzNow = new Date();
      const tzForToday = await getUserTimezone(userId);
      const todayLocalIso = localDateString(tzNow, tzForToday);
      const [y, m, d] = todayLocalIso.split("-").map((n) => parseInt(n, 10));
      const monthStartLocal = `${y}-${String(m).padStart(2, "0")}-01`;
      const monthEndDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const monthEndLocal = `${y}-${String(m).padStart(2, "0")}-${String(monthEndDay).padStart(2, "0")}`;
      let numbers: { breathing: number; afterRent: number; paycheckCopy: string };
      let forecast: Awaited<ReturnType<typeof forecastNextNDays>> = [];
      let monthly: {
        income: number;
        spentToDate: number;
        committedRest: number;
        surplus: number;
        source: string;
      } | null = null;
      try {
        const income = await getMonthlyIncome(userId, householdId, tzNow);
        const [plaidSpent, manualSpent] = await Promise.all([
          db
            .select({ amount: plaidTransactions.amount })
            .from(plaidTransactions)
            .where(
              and(
                eq(plaidTransactions.coupleId, householdId),
                eq(plaidTransactions.status, "accepted"),
                gte(plaidTransactions.date, monthStartLocal),
                sql`${plaidTransactions.date} <= ${todayLocalIso}`,
                sql`${plaidTransactions.amount} > 0`,
              ),
            ),
          db
            .select({ amount: expenses.amount })
            .from(expenses)
            .where(
              and(
                eq(expenses.coupleId, householdId),
                gte(expenses.date, monthStartLocal),
                sql`${expenses.date} <= ${todayLocalIso}`,
                sql`${expenses.amount} > 0`,
              ),
            ),
        ]);
        const spentToDate = Math.round(
          plaidSpent.reduce((s, r) => s + r.amount, 0) +
            manualSpent.reduce((s, r) => s + r.amount, 0),
        );
        const { subscriptions: subsTbl } = await import("../../../shared/schema");
        const subs = await db
          .select({ amount: subsTbl.amount, nextChargeAt: subsTbl.nextChargeAt })
          .from(subsTbl)
          .where(
            and(
              eq(subsTbl.householdId, householdId),
              eq(subsTbl.status, "active"),
            ),
          );
        const committedRest = Math.round(
          subs.reduce((s, r) => {
            if (!r.nextChargeAt) return s;
            const dd = r.nextChargeAt.slice(0, 10);
            if (dd > todayLocalIso && dd <= monthEndLocal) return s + r.amount;
            return s;
          }, 0),
        );
        const surplus = Math.round(income.amount - spentToDate - committedRest);
        monthly = {
          income: income.amount,
          spentToDate,
          committedRest,
          surplus,
          source: income.source,
        };
        const paycheckCopy = income.amount > 0
          ? `$${Math.round(income.amount)} earned · $${spentToDate} spent · $${committedRest} committed`
          : plaidConnected
            ? "Tell Tilly your monthly income to anchor this"
            : "Connect a bank or tell Tilly your income";
        numbers = {
          breathing: Math.max(0, surplus),
          afterRent: Math.max(0, surplus),
          paycheckCopy,
        };
        forecast = await forecastNextNDays(userId, householdId, 7, tzNow);
      } catch (mErr) {
        console.warn("/api/tilly/today monthly fallback:", mErr);
        // Last-resort: the old weekly heuristic so the hero doesn't go
        // blank. Keeps the screen usable while we investigate.
        const fromTx = await estimateFromTransactions(householdId);
        numbers = fromTx ?? {
          breathing: 0,
          afterRent: 0,
          paycheckCopy: plaidConnected
            ? "Calculating…"
            : "Connect a bank to see your numbers",
        };
      }

      // Pass a pending-queue summary to the LLM so the home screen invite
      // can reference something concrete ("Want to talk about your $4K in
      // loan payments?") instead of the generic "Anything you want to
      // think through?" — that's what makes the page feel personal rather
      // than templated. Computed lazily; failure is non-fatal.
      let pendingSummary: {
        count: number;
        totalAmount: number;
        topCategories: Array<{ category: string; count: number; amount: number }>;
      } | null = null;
      try {
        const pendingRows = await db
          .select({
            amount: plaidTransactions.amount,
            category: plaidTransactions.ourCategory,
          })
          .from(plaidTransactions)
          .where(
            and(
              eq(plaidTransactions.coupleId, householdId),
              eq(plaidTransactions.status, "pending_review"),
            ),
          )
          .limit(200);
        if (pendingRows.length > 0) {
          const byCat = new Map<string, { count: number; amount: number }>();
          let total = 0;
          for (const r of pendingRows) {
            total += r.amount;
            const cat = r.category || "other";
            const c = byCat.get(cat) ?? { count: 0, amount: 0 };
            c.count += 1;
            c.amount += r.amount;
            byCat.set(cat, c);
          }
          pendingSummary = {
            count: pendingRows.length,
            totalAmount: total,
            topCategories: [...byCat.entries()]
              .map(([category, v]) => ({ category, ...v }))
              .sort((a, b) => b.amount - a.amount),
          };
        }
      } catch (pendingErr) {
        console.warn("/api/tilly/today pending summary fallback:", pendingErr);
      }

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
          pendingSummary,
        });
      } catch (llmErr) {
        console.warn("/api/tilly/today llm fallback:", llmErr);
        brief = deterministicBrief(name, tone, numbers, dreamTile);
      }

      // Task #23: surface up to 3 open sync-time questions on Today so the
      // BTHome screen can render its "Tilly has questions" strip.
      let openQuestions: Array<{
        id: string;
        kind: string;
        body: string;
        payload: Record<string, unknown>;
      }> = [];
      try {
        const { listOpenQuestions } = await import("../../tilly/question-generator");
        const rows = await listOpenQuestions(householdId, 3);
        openQuestions = rows.map((q) => ({
          id: q.id,
          kind: q.kind,
          body: q.body,
          payload: (q.payload ?? {}) as Record<string, unknown>,
        }));
      } catch (qErr) {
        console.warn("/api/tilly/today openQuestions fallback:", qErr);
      }

      res.json({
        ready: true,
        ...brief,
        monthly,
        forecast,
        openQuestions,
        // Authoritative signal for the mobile to decide between the
        // "connect your bank" empty state and the connected-state hero
        // card. Computed from plaid_items above; prevents the empty
        // state from leaking when surplus happens to be \$0 (no
        // detected income yet, but banks ARE wired).
        bankConnected: plaidConnected,
      });
    } catch (err) {
      console.error("/api/tilly/today error:", err);
      // Even the fall-through DB read failed — give the client a structured
      // ready:false so the screen renders its empty state instead of a 500.
      res.json({ phase: 2, ready: false, reason: "transient" });
    }
  });

  // GET /api/tilly/monthly-summary — Tilly's basic-finance-app answer:
  // this month you earned $X, spent $Y, and have $Z still committed
  // (rent / subs / loans posting before month-end), so surplus = X−Y−Z.
  // Replaces the meaningless "$8908 breathing room" heuristic on Home.
  app.get(
    "/api/tilly/monthly-summary",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      const userId = req.user.id;
      if (!householdId) {
        return res.json({ ready: false, reason: "no_household" });
      }
      try {
        const { getMonthlyIncome } = await import("../../tilly/income-summary");
        const { getUserTimezone, localDateString } = await import("../../tilly/user-tz");
        const now = new Date();
        const tz = await getUserTimezone(userId);
        const today = localDateString(now, tz);
        const [y, m, d] = today.split("-").map((n) => parseInt(n, 10));
        const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const monthEnd = new Date(Date.UTC(y, m, 0)); // last day of this month
        const daysInMonth = monthEnd.getUTCDate();
        const daysLeft = Math.max(0, daysInMonth - d);

        // Income — Plaid-preferred, self-report fallback.
        const income = await getMonthlyIncome(userId, householdId, now);

        // Spent month-to-date — accepted plaid tx (amount > 0) plus
        // manual expenses, both in [monthStart, today].
        const [plaidSpent, manualSpent] = await Promise.all([
          db
            .select({ amount: plaidTransactions.amount })
            .from(plaidTransactions)
            .where(
              and(
                eq(plaidTransactions.coupleId, householdId),
                eq(plaidTransactions.status, "accepted"),
                gte(plaidTransactions.date, monthStart),
                sql`${plaidTransactions.date} <= ${today}`,
                sql`${plaidTransactions.amount} > 0`,
              ),
            ),
          db
            .select({ amount: expenses.amount })
            .from(expenses)
            .where(
              and(
                eq(expenses.coupleId, householdId),
                gte(expenses.date, monthStart),
                sql`${expenses.date} <= ${today}`,
                sql`${expenses.amount} > 0`,
              ),
            ),
        ]);
        const spentToDate = Math.round(
          plaidSpent.reduce((s, r) => s + r.amount, 0) +
            manualSpent.reduce((s, r) => s + r.amount, 0),
        );

        // Committed rest-of-month — subscriptions with nextChargeAt
        // between (today, monthEnd]. Tight: we only count what we
        // KNOW will hit; baseline-style "you'll probably spend $X more
        // discretionary" lives on the day-by-day forecast instead.
        const { subscriptions: subsTbl } = await import("../../../shared/schema");
        const monthEndIso = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
        const upcomingSubs = await db
          .select({ amount: subsTbl.amount, nextChargeAt: subsTbl.nextChargeAt })
          .from(subsTbl)
          .where(
            and(
              eq(subsTbl.householdId, householdId),
              eq(subsTbl.status, "active"),
            ),
          );
        const committedRest = Math.round(
          upcomingSubs.reduce((s, r) => {
            if (!r.nextChargeAt) return s;
            const d = r.nextChargeAt.slice(0, 10);
            if (d > today && d <= monthEndIso) return s + r.amount;
            return s;
          }, 0),
        );

        const surplus = Math.round(income.amount - spentToDate - committedRest);

        res.json({
          ready: true,
          month: `${y}-${String(m).padStart(2, "0")}`,
          income: { amount: income.amount, source: income.source, note: income.note ?? null },
          spentToDate,
          committedRest,
          surplus,
          daysLeft,
        });
      } catch (err) {
        console.error("/api/tilly/monthly-summary error:", err);
        res.status(500).json({ error: "monthly-summary failed" });
      }
    },
  );

  // GET /api/tilly/forecast?days=7 — per-day expected spend for the
  // next N days. Composes known recurring obligations + trailing-8wk
  // per-dayOfWeek baseline + month-shape adjustment.
  app.get(
    "/api/tilly/forecast",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      const userId = req.user.id;
      if (!householdId) return res.json({ days: [] });
      try {
        const { forecastNextNDays } = await import("../../tilly/forecast");
        const days = Math.min(
          Math.max(parseInt(String(req.query.days ?? "7"), 10) || 7, 1),
          30,
        );
        const out = await forecastNextNDays(userId, householdId, days);
        res.json({ days: out });
      } catch (err) {
        console.error("/api/tilly/forecast error:", err);
        res.status(500).json({ error: "forecast failed" });
      }
    },
  );

  // GET /api/tilly/categories?range=all|month|year — every category
  // that's seen activity in the chosen window. Default is `all` so the
  // user can recategorize any merchant that's ever synced, even old
  // rows like a February rent payment. The 30-day window was hiding
  // months-old merchants from the Categorize Spend screen — the user
  // could see them on the Year-view Spend chart but couldn't move
  // them, which is the bug we're fixing here.
  //
  // monthTotal is kept as a field name for client back-compat — it's
  // now the total across the chosen range, not specifically a month.
  app.get("/api/tilly/categories", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    const userId = req.user.id;
    if (!householdId) return res.json({ categories: [] });

    try {
      const rangeQ = String(req.query.range ?? "all").toLowerCase();
      const range: "all" | "month" | "year" =
        rangeQ === "month" || rangeQ === "year" ? rangeQ : "all";
      let sinceIso: string | null = null;
      if (range === "month") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        sinceIso = d.toISOString().slice(0, 10);
      } else if (range === "year") {
        const d = new Date();
        d.setDate(d.getDate() - 365);
        sinceIso = d.toISOString().slice(0, 10);
      }

      const txRows = await db
        .select({
          category: plaidTransactions.ourCategory,
          amount: plaidTransactions.amount,
        })
        .from(plaidTransactions)
        .where(
          and(
            eq(plaidTransactions.coupleId, householdId),
            eq(plaidTransactions.status, "accepted"),
            ...(sinceIso ? [gte(plaidTransactions.date, sinceIso)] : []),
          ),
        );

      // Sum totals per category. INCOME rows in Plaid come through with
      // negative amounts (money in); we use Math.abs so the income row
      // surfaces as a positive total alongside the spend categories —
      // that lets the cash-flow page render both in one list. The
      // `kind` field (income / adjustment / spend) tells the client
      // how to style + which actions to offer.
      const totals = new Map<string, { monthTotal: number; count: number }>();
      for (const r of txRows) {
        if (typeof r.amount !== "number" || r.amount === 0) continue;
        const cat = (r.category || "other").toLowerCase();
        const t = totals.get(cat) ?? { monthTotal: 0, count: 0 };
        t.monthTotal += Math.abs(r.amount);
        t.count += 1;
        totals.set(cat, t);
      }

      const prefRows = await db
        .select()
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, userId),
            eq(userPreferences.scope, "spend"),
          ),
        );
      const overrides = new Map<string, boolean>();
      for (const p of prefRows) {
        if (!p.key.startsWith("include_in_spend.")) continue;
        const cat = p.key.slice("include_in_spend.".length).toLowerCase();
        const v = p.value as { includeInSpend?: unknown } | null;
        if (typeof v?.includeInSpend === "boolean") overrides.set(cat, v.includeInSpend);
      }

      // Cash-flow taxonomy:
      //   income     — paychecks / take-home (counted toward income line)
      //   adjustment — transfers, cashback, credit_adjustment
      //                (net-zero against the wallet; excluded from spend
      //                AND from income totals)
      //   spend      — everything else; subject to the include_in_spend
      //                pref toggle. Defaults to excluded for loans/
      //                taxes/fees (treated as money-flow-only).
      const ADJUSTMENT = new Set(["transfers", "cashback", "credit_adjustment"]);
      const DEFAULT_FIXED = new Set(["loans", "taxes", "fees"]);
      type CashFlowKind = "income" | "adjustment" | "spend";
      const categories = Array.from(totals.entries())
        .map(([name, t]) => {
          let kind: CashFlowKind;
          if (name === "income") kind = "income";
          else if (ADJUSTMENT.has(name)) kind = "adjustment";
          else kind = "spend";
          const isDefaultFixed =
            kind === "income" || kind === "adjustment" || DEFAULT_FIXED.has(name);
          const override = overrides.get(name);
          // Only `spend` rows can be toggled in/out of the headline.
          // Income + adjustments are never in spend by definition.
          const includeInSpend =
            kind !== "spend"
              ? false
              : override !== undefined
                ? override
                : !isDefaultFixed;
          return {
            name,
            kind,
            monthTotal: Math.round(t.monthTotal * 100) / 100,
            transactionCount: t.count,
            includeInSpend,
            isDefaultFixed,
            hasOverride: override !== undefined,
          };
        })
        .sort((a, b) => b.monthTotal - a.monthTotal);
      res.json({ range, categories });
    } catch (err) {
      console.warn("/api/tilly/categories error:", err);
      res.status(500).json({ error: "categories failed" });
    }
  });

  // GET /api/tilly/categories/:name/merchants?range=all|month|year
  // every merchant whose ourCategory matches, with total + count over
  // the chosen window. Default `all` so any historically synced
  // merchant is reachable, not just the last 30 days.
  app.get(
    "/api/tilly/categories/:name/merchants",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.json({ merchants: [] });
      const cat = String(req.params.name).toLowerCase();
      const rangeQ = String(req.query.range ?? "all").toLowerCase();
      const range: "all" | "month" | "year" =
        rangeQ === "month" || rangeQ === "year" ? rangeQ : "all";
      let sinceIso: string | null = null;
      if (range === "month") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        sinceIso = d.toISOString().slice(0, 10);
      } else if (range === "year") {
        const d = new Date();
        d.setDate(d.getDate() - 365);
        sinceIso = d.toISOString().slice(0, 10);
      }
      try {
        const filtered = await db
          .select()
          .from(plaidTransactions)
          .where(
            and(
              eq(plaidTransactions.coupleId, householdId),
              eq(plaidTransactions.ourCategory, cat),
              ...(sinceIso ? [gte(plaidTransactions.date, sinceIso)] : []),
            ),
          );
        const out = new Map<
          string,
          { signature: string; displayName: string; monthTotal: number; count: number; lastDate: string }
        >();
        for (const r of filtered) {
          if (typeof r.amount !== "number" || r.amount === 0) continue;
          // Plaid stores income with negative amounts (money in); spend
          // is positive. Bucket by absolute value so income merchants
          // surface in the drill-in just like spend merchants. Without
          // this, "Income" / "cashback" / "credit_adjustment" drill-ins
          // came up empty even though the parent row showed a total.
          const absAmt = Math.abs(r.amount);
          const sig = (r.signature || "").trim().toLowerCase();
          if (!sig) continue;
          const display =
            (r.merchantName && r.merchantName.trim()) ||
            (r.name && r.name.trim()) ||
            sig;
          const existing = out.get(sig);
          if (existing) {
            existing.monthTotal += absAmt;
            existing.count += 1;
            if (r.date > existing.lastDate) existing.lastDate = r.date;
          } else {
            out.set(sig, {
              signature: sig,
              displayName: display,
              monthTotal: absAmt,
              count: 1,
              lastDate: r.date,
            });
          }
        }
        const merchants = Array.from(out.values())
          .map((m) => ({ ...m, monthTotal: Math.round(m.monthTotal * 100) / 100 }))
          .sort((a, b) => b.monthTotal - a.monthTotal);
        res.json({ category: cat, range, merchants });
      } catch (err) {
        console.warn("/api/tilly/categories/:name/merchants error:", err);
        res.status(500).json({ error: "merchants failed" });
      }
    },
  );

  // POST /api/tilly/tools/:name — run any registered tool through the
  // same dispatcher chat uses. Lets the Categories screen and other
  // mutating UI surfaces fire setCategoryInclusion (and future tools)
  // without forking logic per screen. Body is the tool args object.
  app.post(
    "/api/tilly/tools/:name",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const name = String(req.params.name);
      if (!(TOOL_NAMES as readonly string[]).includes(name)) {
        return res.status(400).json({ error: `unknown tool: ${name}` });
      }
      try {
        const result = await executeTool(name as ToolName, req.body ?? {}, {
          userId: req.user.id,
          householdId,
        });
        if (!result) {
          return res.status(400).json({ error: "validation_or_dispatch_failed" });
        }
        res.json({ result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`/api/tilly/tools/${name} error:`, msg);
        res.status(500).json({ error: msg });
      }
    },
  );

  app.get("/api/tilly/spend-pattern", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ phase: 4, ready: false });

    try {
      const rangeParam = String(req.query.range ?? "week");
      const range =
        rangeParam === "month" || rangeParam === "year" ? rangeParam : "week";
      // Offset = how many periods back from the current one. 0 = current,
      // -1 = last month / last year. Capped to non-positive so a typo
      // can't ask for a future period (which would return 0 data + a
      // bogus verdict).
      const offsetRaw = parseInt(String(req.query.offset ?? "0"), 10);
      const offset =
        Number.isFinite(offsetRaw) && offsetRaw < 0
          ? Math.max(offsetRaw, -23) // year-back limit: 2 years worth
          : 0;
      const pattern = await buildWeeklyPattern(
        householdId,
        req.user.id,
        range,
        offset,
      );
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

      let lifeContext: {
        employmentType: string | null;
        ageBand: string | null;
        city: string | null;
        dependents: number | null;
        supportNote: string | null;
      } | null = null;
      try {
        const { tillyLifeContext } = await import("../../../shared/schema");
        const [row] = await db
          .select()
          .from(tillyLifeContext)
          .where(eq(tillyLifeContext.householdId, householdId))
          .orderBy(sql`${tillyLifeContext.createdAt} desc`)
          .limit(1);
        if (row) {
          lifeContext = {
            employmentType: row.employmentType ?? null,
            ageBand: row.ageBand ?? null,
            city: row.city ?? null,
            dependents: row.dependents ?? null,
            supportNote: row.supportNote ?? null,
          };
        }
      } catch {}

      res.json({
        ready: true,
        name: user?.name ?? "You",
        school: household?.schoolShort ?? household?.schoolName ?? null,
        studentRole: household?.studentRole ?? null,
        daysWithTilly,
        tone,
        trusted,
        lifeContext,
      });
    } catch (err) {
      console.error("/api/tilly/profile error:", err);
      res.status(500).json({ error: "profile failed", phase: 2 });
    }
  });
}
