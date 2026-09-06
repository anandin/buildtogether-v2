/**
 * Engagement loop — the four outbound surfaces that make Tilly reach the
 * user instead of waiting to be opened. One hourly cron drives all four;
 * each is internally gated by local time + idempotency so the loop is
 * safe to retry and never double-sends.
 *
 *   1. Morning brief (8am local, DELTA-GATED) — fires only when there's
 *      something genuinely new: a bill within 48h, a payday within 2
 *      days, or a fresh observation. A push that's sometimes silent is
 *      more trusted than a daily one that's usually noise.
 *   2. Weekly review (Sunday 6pm local) — week vs prior week, soft spot,
 *      dream pace vs target date, one open question.
 *   3. Cap check (every hour) — category caps cross 80% / 100%.
 *   4. Mid-cycle correction (noon local, ≥7 days into a pay cycle) —
 *      the Payday Pulse made a variable-burn forecast; this holds it
 *      accountable when actuals run >20% over.
 *
 * All copy is deterministic templates with real numbers — no LLM on
 * these paths. The numbers ARE the content; phrasing risk buys nothing.
 *
 * Every push carries a badge count (open questions + unresolved nudges)
 * so the app icon reflects what's waiting.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import {
  goalContributions,
  goals,
  households,
  plaidTransactions,
  expenses,
  subscriptions,
  tillyMemory,
  tillyNudges,
  tillyQuestions,
  userPreferences,
  users,
} from "../../shared/schema";
import { bucketFor, loadUserOverrides } from "./taxonomy";
import { getUserTimezone, localDateString, localDaysAgoIso } from "./user-tz";
import { projectRemainingIncomeForMonth } from "./income-summary";
import { sendExpoPush } from "./expo-push";
import { recordNudgeSent } from "./nudge-log";
import { addDaysIso } from "./payday-brief";
import { buildWeeklyPattern } from "./spend-pattern";
import { composeWeeklyReview, isMaterialDelta } from "./weekly-review";
import { narrateWeek } from "./week-narrator";
import { watchlistItems } from "../../shared/schema";
import { enqueueScout } from "./scout/orchestrator";

// ── Shared scaffolding ───────────────────────────────────────────────

type HouseholdCtx = {
  householdId: string;
  userId: string;
  tz: string;
  localHour: number;
  localDow: number; // 0=Sunday
  todayIso: string;
  token: string | null;
};

async function resolveHouseholds(now: Date): Promise<HouseholdCtx[]> {
  const rows = await db.select({ id: households.id }).from(households).limit(1000);
  const out: HouseholdCtx[] = [];
  for (const h of rows) {
    const userRow = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.coupleId, h.id))
      .limit(1);
    const user = userRow[0];
    if (!user) continue;
    const tz = await getUserTimezone(user.id);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
    const localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const localDow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    out.push({
      householdId: h.id,
      userId: user.id,
      tz,
      localHour,
      localDow,
      todayIso: localDateString(now, tz),
      token: user.expoPushToken ?? null,
    });
  }
  return out;
}

/** One row per (source, dedupeKey) — the universal idempotency check. */
async function alreadySent(
  userId: string,
  source: string,
  dedupeKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: tillyNudges.id })
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, userId),
        sql`${tillyNudges.context} ->> 'source' = ${source}`,
        sql`${tillyNudges.context} ->> 'dedupeKey' = ${dedupeKey}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Badge = what's actionable in-app right now. */
export async function computeBadgeCount(userId: string, householdId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000);
  const [openQuestions, pendingNudges] = await Promise.all([
    db
      .select({ id: tillyQuestions.id })
      .from(tillyQuestions)
      .where(and(eq(tillyQuestions.householdId, householdId), eq(tillyQuestions.status, "open")))
      .limit(20),
    db
      .select({ id: tillyNudges.id })
      .from(tillyNudges)
      .where(
        and(
          eq(tillyNudges.userId, userId),
          isNull(tillyNudges.outcome),
          eq(tillyNudges.channel, "in_app_card"),
          gte(tillyNudges.sentAt, cutoff),
        ),
      )
      .limit(20),
  ]);
  return openQuestions.length + pendingNudges.length;
}

async function pushWithRecord(input: {
  ctx: HouseholdCtx;
  source: string;
  dedupeKey: string;
  frame: Parameters<typeof recordNudgeSent>[0]["frame"];
  title: string;
  body: string;
  cardBody?: string;
  dateLabel?: string;
  extraContext?: Record<string, unknown>;
}): Promise<{ pushed: boolean }> {
  const { ctx } = input;
  // In-app presence first (memory row → Home card + chat retrieval).
  let memId: string | undefined;
  if (input.cardBody) {
    const [memRow] = await db
      .insert(tillyMemory)
      .values({
        userId: ctx.userId,
        householdId: ctx.householdId,
        kind: "observation",
        body: input.cardBody,
        source: "inferred",
        dateLabel: input.dateLabel ?? "Today",
        isMostRecent: true,
      })
      .returning();
    memId = memRow.id;
  }
  await recordNudgeSent({
    userId: ctx.userId,
    householdId: ctx.householdId,
    frame: input.frame,
    channel: "push",
    body: input.body,
    context: { source: input.source, dedupeKey: input.dedupeKey, ...(input.extraContext ?? {}) },
    sourceTable: memId ? "tilly_memory" : undefined,
    sourceId: memId,
  });
  if (!ctx.token) return { pushed: false };
  const badge = await computeBadgeCount(ctx.userId, ctx.householdId);
  const ticket = await sendExpoPush({
    to: ctx.token,
    title: input.title,
    body: input.body,
    badge,
    data: { route: "home", kind: input.source },
  });
  return { pushed: ticket?.status === "ok" };
}

/** Variable-bucket spend between two local dates (inclusive), with a
 * per-category breakdown. Accepted Plaid + manual rows, user overrides
 * honoured — the same taxonomy every other surface uses. */
async function variableSpendBetween(
  userId: string,
  householdId: string,
  fromIso: string,
  toIso: string,
): Promise<{ total: number; byCategory: Map<string, number> }> {
  const overrides = await loadUserOverrides(userId);
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({ amount: plaidTransactions.amount, category: plaidTransactions.ourCategory })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "accepted"),
          gte(plaidTransactions.date, fromIso),
          sql`${plaidTransactions.date} <= ${toIso}`,
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select({ amount: expenses.amount, category: expenses.category, source: expenses.source })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          gte(expenses.date, fromIso),
          sql`${expenses.date} <= ${toIso}`,
          sql`${expenses.amount} > 0`,
        ),
      ),
  ]);
  const byCategory = new Map<string, number>();
  let total = 0;
  const fold = (amount: number, category: string | null) => {
    const cat = (category ?? "").toLowerCase();
    if (bucketFor(cat, overrides) !== "variable") return;
    total += amount;
    byCategory.set(cat || "other", (byCategory.get(cat || "other") ?? 0) + amount);
  };
  for (const r of plaidRows) fold(r.amount, r.category);
  for (const r of manualRows) {
    if (r.source === "plaid") continue;
    fold(r.amount, r.category);
  }
  return { total, byCategory };
}

// ── 1. Morning brief (8am local, delta-gated) ────────────────────────

async function morningBriefFor(ctx: HouseholdCtx, now: Date): Promise<boolean> {
  if (ctx.localHour !== 8) return false;
  if (await alreadySent(ctx.userId, "morning_brief", ctx.todayIso)) return false;

  const facts: string[] = [];

  // Bill within 48h.
  const within2d = addDaysIso(ctx.todayIso, 2);
  const subs = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.householdId, ctx.householdId), eq(subscriptions.status, "active")));
  const dueSoon = subs
    .filter((s) => {
      const next = s.nextChargeAt?.slice(0, 10);
      return next && next > ctx.todayIso && next <= within2d;
    })
    .sort((a, b) => b.amount - a.amount);
  if (dueSoon[0]) {
    const d = dueSoon[0];
    const when = d.nextChargeAt!.slice(0, 10) === addDaysIso(ctx.todayIso, 1) ? "tomorrow" : "in 2 days";
    facts.push(`${d.merchant} ($${Math.round(d.amount)}) hits ${when}.`);
  }

  // Payday within 2 days.
  const projection = await projectRemainingIncomeForMonth(ctx.householdId, now, ctx.tz);
  if (
    projection.nextPaycheckDate &&
    projection.nextPaycheckDate > ctx.todayIso &&
    projection.nextPaycheckDate <= within2d
  ) {
    const when = projection.nextPaycheckDate === addDaysIso(ctx.todayIso, 1) ? "tomorrow" : "in 2 days";
    facts.push(`Paycheck (~$${Math.round(projection.typicalAmount).toLocaleString()}) lands ${when}.`);
  }

  // Fresh observation in the last 24h (pattern cron, payday pulse, etc.)
  if (facts.length === 0) {
    const fresh = await db
      .select({ body: tillyMemory.body })
      .from(tillyMemory)
      .where(
        and(
          eq(tillyMemory.userId, ctx.userId),
          eq(tillyMemory.kind, "observation"),
          sql`${tillyMemory.noticedAt} >= NOW() - INTERVAL '24 hours'`,
        ),
      )
      .orderBy(desc(tillyMemory.noticedAt))
      .limit(1);
    if (fresh[0]?.body) facts.push(fresh[0].body.slice(0, 140));
  }

  // No delta → no push. Silence is the feature.
  if (facts.length === 0) return false;

  const body = facts.slice(0, 2).join(" ");
  await pushWithRecord({
    ctx,
    source: "morning_brief",
    dedupeKey: ctx.todayIso,
    frame: "implementation_intention",
    title: "Tilly",
    body,
  });
  return true;
}

// ── 2. Weekly review (Sunday 6pm local) ──────────────────────────────

// Rewritten 2026-08-10 around the offer-or-silence doctrine after the
// live push buried a $2,638 week-over-week WIN under "You spent $773…
// $773 spent. Thursdays are still your soft spot." — a report with a
// duplicated total and a judgment, asking for nothing. The composer
// (weekly-review.ts) owns all copy; this function only assembles inputs
// and honors silence. See docs/PRD_COMMITMENT_LAYER.md §3.
async function weeklyReviewFor(ctx: HouseholdCtx, now: Date): Promise<boolean> {
  if (ctx.localDow !== 0 || ctx.localHour !== 18) return false;
  const weekKey = ctx.todayIso; // Sundays are unique per week
  if (await alreadySent(ctx.userId, "weekly_review", weekKey)) return false;

  const weekStart = addDaysIso(ctx.todayIso, -6);
  const priorStart = addDaysIso(ctx.todayIso, -13);
  const priorEnd = addDaysIso(ctx.todayIso, -7);
  const [thisWeek, priorWeek] = await Promise.all([
    variableSpendBetween(ctx.userId, ctx.householdId, weekStart, ctx.todayIso),
    variableSpendBetween(ctx.userId, ctx.householdId, priorStart, priorEnd),
  ]);

  // Claim target: the goal with the most left to fund. A win week's
  // offer points here; without one, a win week is silent.
  const goalRows = await db
    .select()
    .from(goals)
    .where(eq(goals.coupleId, ctx.householdId))
    .limit(5);
  const funded = goalRows
    .map((g) => ({
      goalId: g.id,
      name: g.name,
      remainingToTarget: Math.max(0, g.targetAmount - g.savedAmount),
    }))
    .filter((g) => g.remainingToTarget > 0)
    .sort((a, b) => b.remainingToTarget - a.remainingToTarget);

  // Strongest habitual category×day cell — surfaced only as a forward
  // pre-commitment offer, never as a verdict on the closed week.
  let softSpot: { day: string; category: string } | null = null;
  try {
    const pattern = await buildWeeklyPattern(ctx.householdId, ctx.userId);
    if (pattern?.italicSpan) {
      const softCat = pattern.categories.find((c) => c.softSpot);
      softSpot = { day: pattern.italicSpan, category: softCat?.name ?? "day-to-day spending" };
    }
  } catch {
    /* advisory only */
  }

  // Claim offers are affordability-adjacent — gated on the income
  // denominator like every other surplus claim. Degrades CLOSED.
  let incomeBlocked = true;
  try {
    const { buildIncomeReview } = await import("./income-review");
    const review = await buildIncomeReview(ctx.userId, ctx.householdId, now);
    incomeBlocked = review.confidence.blocksSurplusClaims;
  } catch (err) {
    console.warn("[weekly-review] income review failed, degrading closed:", err);
  }

  // Primary path: read the week as a life record. When the merchants
  // tell a recognizable story ("a kids-and-outings week"), the push
  // affirms the life-spend and names the checkable leakage that rode
  // along — spend = life + leakage. Only material weeks earn the LLM
  // call; an ordinary week stays silent either way.
  const delta = Math.round(thisWeek.total - priorWeek.total);
  let narration: Awaited<ReturnType<typeof narrateWeek>> = null;
  if (isMaterialDelta(delta, priorWeek.total)) {
    narration = await narrateWeek({
      userId: ctx.userId,
      householdId: ctx.householdId,
      weekStartIso: weekStart,
      weekEndIso: ctx.todayIso,
      thisWeekTotal: thisWeek.total,
      priorWeekTotal: priorWeek.total,
      incomeBlocked,
    });
  }

  if (narration) {
    await pushWithRecord({
      ctx,
      source: "weekly_review",
      dedupeKey: weekKey,
      // Affirming that the money went where their life is = autonomy
      // support; lets the bandit learn whether story-framing converts.
      frame: "sdt_autonomy",
      title: narration.storyLabel || "Your week",
      body: narration.narrative,
      cardBody: narration.narrative,
      dateLabel: "Weekly review",
      extraContext: { storyLabel: narration.storyLabel, leakage: narration.leakage },
    });
    return true;
  }

  // Fallback: the deterministic composer — claim offer / pre-commit
  // offer / income question, or silence.
  const push = composeWeeklyReview({
    thisWeekTotal: thisWeek.total,
    priorWeekTotal: priorWeek.total,
    claimTarget: funded[0] ?? null,
    softSpot,
    incomeBlocked,
  });

  // Silence is success: nothing decidable this week, so no interruption
  // — and no alreadySent record, since nothing was sent.
  if (!push) return false;

  await pushWithRecord({
    ctx,
    source: "weekly_review",
    dedupeKey: weekKey,
    frame: push.frame,
    title: push.title,
    body: push.body,
    cardBody: push.cardBody ?? push.body,
    dateLabel: "Weekly review",
    extraContext: push.claimSuggestion ? { claimSuggestion: push.claimSuggestion } : undefined,
  });
  return true;
}

// ── 3. Category cap check (hourly) ───────────────────────────────────

async function capChecksFor(ctx: HouseholdCtx, now: Date): Promise<number> {
  const capRows = await db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, ctx.userId), eq(userPreferences.scope, "caps")));
  if (capRows.length === 0) return 0;

  const monthKey = ctx.todayIso.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const { byCategory } = await variableSpendBetween(
    ctx.userId,
    ctx.householdId,
    monthStart,
    ctx.todayIso,
  );

  let sent = 0;
  for (const row of capRows) {
    if (!row.key.startsWith("cap.")) continue;
    const category = row.key.slice("cap.".length);
    const cap = (row.value as { monthlyCap?: number } | null)?.monthlyCap;
    if (!cap || cap <= 0) continue;
    const spent = Math.round(byCategory.get(category) ?? 0);
    const threshold = spent >= cap ? 100 : spent >= cap * 0.8 ? 80 : null;
    if (!threshold) continue;
    const dedupeKey = `${category}|${threshold}|${monthKey}`;
    if (await alreadySent(ctx.userId, "category_cap", dedupeKey)) continue;
    const body =
      threshold === 100
        ? `${category} just crossed its $${cap} cap — $${spent} so far this month.`
        : `${category} is at $${spent} of its $${cap} cap (${Math.round((spent / cap) * 100)}%) with ${daysLeftInMonth(ctx.todayIso)} days left.`;
    await pushWithRecord({
      ctx,
      source: "category_cap",
      dedupeKey,
      frame: "pre_commitment",
      title: "Cap check",
      body,
      extraContext: { category, cap, spent, threshold },
    });
    sent++;
  }
  return sent;
}

function daysLeftInMonth(todayIso: string): number {
  const [y, m, d] = todayIso.split("-").map((n) => parseInt(n, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(0, last - d);
}

// ── 4. Mid-cycle correction (noon local) ─────────────────────────────

async function midCycleCorrectionFor(ctx: HouseholdCtx, now: Date): Promise<boolean> {
  if (ctx.localHour !== 12) return false;

  // The most recent Payday Pulse carries the cycle forecast.
  const pulseRows = await db
    .select({ context: tillyNudges.context })
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, ctx.userId),
        sql`${tillyNudges.context} ->> 'source' = 'payday_pulse'`,
      ),
    )
    .orderBy(desc(tillyNudges.sentAt))
    .limit(1);
  const pulseCtx = pulseRows[0]?.context as
    | { paydayDate?: string; allocation?: { cycleDays?: number; expectedVariable?: number } }
    | undefined;
  const paydayDate = pulseCtx?.paydayDate;
  const cycleDays = pulseCtx?.allocation?.cycleDays ?? 14;
  const expectedVariable = pulseCtx?.allocation?.expectedVariable ?? 0;
  if (!paydayDate || expectedVariable <= 0) return false;

  const elapsed = Math.round(
    (new Date(ctx.todayIso + "T12:00:00Z").getTime() -
      new Date(paydayDate + "T12:00:00Z").getTime()) /
      86_400_000,
  );
  if (elapsed < 7 || elapsed >= cycleDays) return false;
  if (await alreadySent(ctx.userId, "mid_cycle_correction", paydayDate)) return false;

  const { total, byCategory } = await variableSpendBetween(
    ctx.userId,
    ctx.householdId,
    paydayDate,
    ctx.todayIso,
  );
  const expectedSoFar = expectedVariable * (elapsed / cycleDays);
  if (total <= expectedSoFar * 1.2) return false;

  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const topText = top
    .map(([cat, amt]) => `${cat} $${Math.round(amt)}`)
    .join(", ");
  const over = Math.round(total - expectedSoFar);
  await pushWithRecord({
    ctx,
    source: "mid_cycle_correction",
    dedupeKey: paydayDate,
    frame: "goal_gradient",
    title: "Pace check",
    body: `Day ${elapsed} of your pay cycle: $${over} over your usual pace. Biggest movers: ${topText}.`,
    extraContext: { paydayDate, elapsed, total: Math.round(total), expectedSoFar: Math.round(expectedSoFar) },
  });
  return true;
}

// ── 5. Watchlist price scout (Monday 9am local) ──────────────────────
// The scout pipeline already does the heavy lifting (Tavily search,
// Flash synthesis, completion push). This just feeds it the user's
// watchlist once a week so "I'm eyeing X" turns into "X dropped to $Y"
// without the user asking.

async function watchlistPriceScoutFor(ctx: HouseholdCtx): Promise<number> {
  if (ctx.localDow !== 1 || ctx.localHour !== 9) return 0;
  const items = await db
    .select()
    .from(watchlistItems)
    .where(and(eq(watchlistItems.userId, ctx.userId), eq(watchlistItems.status, "active")))
    .limit(10);
  const priced = items.filter((i) => i.estimatedPrice != null).slice(0, 2); // cost cap
  let started = 0;
  const weekKey = ctx.todayIso; // Mondays are unique per week
  for (const item of priced) {
    const dedupeKey = `${item.id}|${weekKey}`;
    if (await alreadySent(ctx.userId, "watchlist_price_scout", dedupeKey)) continue;
    await recordNudgeSent({
      userId: ctx.userId,
      householdId: ctx.householdId,
      frame: "anchor",
      channel: "push", // the scout job sends the actual push on completion
      body: `price scout queued: ${item.name}`,
      context: { source: "watchlist_price_scout", dedupeKey, itemId: item.id },
    });
    try {
      await enqueueScout({
        userId: ctx.userId,
        householdId: ctx.householdId,
        query: `${item.name} current price sale deal`,
        mode: "wait",
      });
      started++;
    } catch (err) {
      console.warn("[engagement-loop] price scout failed:", item.id, err);
    }
  }
  return started;
}

// ── Orchestrator ─────────────────────────────────────────────────────

export async function runEngagementLoopAll(now: Date = new Date()): Promise<{
  households: number;
  morningBriefs: number;
  weeklyReviews: number;
  capAlerts: number;
  midCycleCorrections: number;
  priceScouts: number;
}> {
  const contexts = await resolveHouseholds(now);
  let morningBriefs = 0;
  let weeklyReviews = 0;
  let capAlerts = 0;
  let midCycleCorrections = 0;
  let priceScouts = 0;
  for (const ctx of contexts) {
    try {
      if (await morningBriefFor(ctx, now)) morningBriefs++;
      if (await weeklyReviewFor(ctx, now)) weeklyReviews++;
      capAlerts += await capChecksFor(ctx, now);
      if (await midCycleCorrectionFor(ctx, now)) midCycleCorrections++;
      priceScouts += await watchlistPriceScoutFor(ctx);
    } catch (err) {
      console.warn("[engagement-loop] household failed:", ctx.householdId, err);
    }
  }
  return {
    households: contexts.length,
    morningBriefs,
    weeklyReviews,
    capAlerts,
    midCycleCorrections,
    priceScouts,
  };
}
