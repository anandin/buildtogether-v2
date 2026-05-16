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

/**
 * One source of truth for the Today + monthly-summary endpoints.
 *
 * Two earlier bugs lived in two near-identical copies of this code:
 *   - Each summed plaid_transactions AND the expenses mirror separately,
 *     double-counting every auto-accepted Plaid row.
 *   - Neither filtered out adjustments (transfers, cashback, credit_
 *     adjustment), so chequing→savings moves and CC bill payments
 *     inflated "spent" by thousands.
 *
 * This helper enforces the same taxonomy spend-pattern uses:
 *   income      → excluded from spend (and from this fn's output entirely)
 *   adjustment  → excluded (net-zero against the wallet)
 *   fixed       → loans/taxes/fees/insurance — real outflow, separate line
 *   variable    → discretionary spend, the main day-to-day signal
 *
 * Adds a forward-look pass: linear-extrapolate today's daily pace to
 * month-end so the hero can show "if pace holds, you close ~$X" instead
 * of a doom YTD number.
 */
async function computeMonthFlow(
  userId: string,
  householdId: string,
  now: Date,
) {
  const { getMonthlyIncome, projectRemainingIncomeForMonth } = await import("../../tilly/income-summary");
  const { getUserTimezone, localDateString } = await import("../../tilly/user-tz");
  const { subscriptions: subsTbl } = await import("../../../shared/schema");

  const tz = await getUserTimezone(userId);
  const today = localDateString(now, tz);
  const [y, m, d] = today.split("-").map((n) => parseInt(n, 10));
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEndIso = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const daysLeft = Math.max(0, daysInMonth - d);

  const income = await getMonthlyIncome(userId, householdId, now);

  // Default taxonomy buckets — overridable per-category via
  // user_preferences scope='taxonomy' key='bucket_override.<cat>'.
  // The override is what the setCategoryBucket tool writes, so when
  // the user says "move taxes to one-off" the next compute uses the
  // new placement. Without overrides, the defaults below run.
  const DEFAULT_RECURRING = new Set([
    "subscriptions",
    "insurance",
    "rent",
    "mortgage",
    "utilities",
  ]);
  const DEFAULT_ONE_OFF = new Set(["taxes", "fees", "loans"]);
  const DEFAULT_ADJUSTMENT = new Set(["transfers", "cashback", "credit_adjustment"]);

  type Bucket = "recurring" | "one_off" | "variable" | "income" | "adjustment";
  const overrideRows = await db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.scope, "taxonomy"),
      ),
    );
  const overrides = new Map<string, Bucket>();
  for (const r of overrideRows) {
    if (!r.key.startsWith("bucket_override.")) continue;
    const cat = r.key.slice("bucket_override.".length);
    const v = r.value as { bucket?: Bucket } | null;
    if (v?.bucket) overrides.set(cat, v.bucket);
  }
  const bucketFor = (cat: string): Bucket => {
    if (overrides.has(cat)) return overrides.get(cat)!;
    if (cat === "income") return "income";
    if (DEFAULT_ADJUSTMENT.has(cat)) return "adjustment";
    if (DEFAULT_RECURRING.has(cat)) return "recurring";
    if (DEFAULT_ONE_OFF.has(cat)) return "one_off";
    return "variable";
  };

  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({
        amount: plaidTransactions.amount,
        ourCategory: plaidTransactions.ourCategory,
        merchantName: plaidTransactions.merchantName,
        name: plaidTransactions.name,
        date: plaidTransactions.date,
      })
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
      .select({
        amount: expenses.amount,
        category: expenses.category,
        source: expenses.source,
        merchant: expenses.merchant,
        description: expenses.description,
        date: expenses.date,
      })
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

  type FlowRow = { amount: number; category: string; merchant: string | null; date: string };
  const allRows: FlowRow[] = [];
  for (const r of plaidRows) {
    allRows.push({
      amount: r.amount,
      category: (r.ourCategory ?? "").toLowerCase(),
      merchant: r.merchantName ?? r.name ?? null,
      date: r.date,
    });
  }
  for (const r of manualRows) {
    if (r.source === "plaid") continue; // sync already mirrored this row
    allRows.push({
      amount: r.amount,
      category: (r.category ?? "").toLowerCase(),
      merchant: r.merchant ?? r.description ?? null,
      date: r.date,
    });
  }

  let variableSoFar = 0;
  let recurringSoFar = 0;
  let oneOffSoFar = 0;
  const variableByCategory = new Map<string, number>();
  for (const r of allRows) {
    const b = bucketFor(r.category);
    if (b === "income" || b === "adjustment") continue;
    if (b === "recurring") {
      recurringSoFar += r.amount;
    } else if (b === "one_off") {
      oneOffSoFar += r.amount;
    } else {
      variableSoFar += r.amount;
      const k = r.category || "other";
      variableByCategory.set(k, (variableByCategory.get(k) ?? 0) + r.amount);
    }
  }
  const fixedSoFar = recurringSoFar + oneOffSoFar;
  const spentToDate = Math.round(variableSoFar + fixedSoFar);

  const activeSubs = await db
    .select({
      amount: subsTbl.amount,
      merchant: subsTbl.merchant,
      lastChargedAt: subsTbl.lastChargedAt,
      nextChargeAt: subsTbl.nextChargeAt,
      usageNote: subsTbl.usageNote,
    })
    .from(subsTbl)
    .where(
      and(eq(subsTbl.householdId, householdId), eq(subsTbl.status, "active")),
    );
  let recurringBaseLoad = 0;
  let committedRest = 0;
  for (const r of activeSubs) {
    const last = r.lastChargedAt?.slice(0, 10) ?? null;
    const next = r.nextChargeAt?.slice(0, 10) ?? null;
    if (last && last >= monthStart && last <= today) recurringBaseLoad += r.amount;
    if (next && next > today && next <= monthEndIso) committedRest += r.amount;
  }
  recurringBaseLoad = Math.round(recurringBaseLoad);
  committedRest = Math.round(committedRest);

  // Honest projection — only VARIABLE outflow extrapolates with days.
  // Fixed obligations (loans, taxes, subs, insurance, rent) are events
  // that already happened this month or will hit on a known schedule;
  // pretending they repeat at a per-day rate is exactly the math bug
  // that produced "-$30k projected close" from a $4.9k one-time tax
  // instalment. Variable scales; fixed-so-far stays as-is; committed-
  // rest gets added separately for known upcoming charges.
  const dailyPace = Math.round(variableSoFar / d);
  const variableProjectedRest = Math.round(dailyPace * daysLeft);
  const projectedSpend = spentToDate + variableProjectedRest + committedRest;

  // Income projection — biweekly/monthly/weekly cadence detection
  // walks forward from the last paycheck and adds typicalAmount for
  // each landing inside (today, monthEnd]. Without this, mid-month
  // users with biweekly pay see a doom forecast because Tilly only
  // counts the one paycheck that's already hit, ignoring the second
  // one she should KNOW is coming.
  const incomeProjection = await projectRemainingIncomeForMonth(householdId, now, tz);
  const incomeProjected = Math.round(income.amount + incomeProjection.projectedRemaining);
  const projectedClose = Math.round(incomeProjected - projectedSpend);
  const surplus = Math.round(income.amount - spentToDate - committedRest);

  // One actionable thing. Priority: unused subs > biggest variable category
  // > nothing-to-flag (null).
  let leverageInsight: { kind: string; text: string; amount: number } | null = null;
  const lowUseSubs = activeSubs.filter(
    (s) => s.usageNote && /not used|unused|0 times|no usage/i.test(s.usageNote),
  );
  if (lowUseSubs.length > 0) {
    const sum = lowUseSubs.reduce((s, r) => s + r.amount, 0);
    leverageInsight = {
      kind: "unused_subs",
      amount: Math.round(sum),
      text: `${lowUseSubs.length} subscription${lowUseSubs.length === 1 ? "" : "s"} you haven't been using = $${Math.round(sum)}/mo if paused`,
    };
  } else {
    const topVar = [...variableByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topVar && topVar[1] >= 200) {
      leverageInsight = {
        kind: "top_variable",
        amount: Math.round(topVar[1]),
        text: `${topVar[0]} is your biggest variable line this month ($${Math.round(topVar[1])}). Worth a closer look?`,
      };
    }
  }

  // Build a cadence override map so the annual_bill_upcoming detector
  // honors user-set merchant cadences (e.g. "TD Visa Preauth is monthly,
  // not semiannual"). Keyed by merchant signature.
  const cadenceOverrides = new Map<string, string>();
  for (const r of overrideRows) {
    if (!r.key.startsWith("cadence_override.")) continue;
    const sig = r.key.slice("cadence_override.".length);
    const v = r.value as { cadence?: string } | null;
    if (v?.cadence) cadenceOverrides.set(sig, v.cadence);
  }

  // Smart Tilly observations — runs the 11 detectors in parallel
  // (item 1, paycheck cadence, is already part of the income calc
  // above, not a side detector). Each returns null if its pattern
  // doesn't fire, or a typed observation if it does. Failures
  // swallow per-detector via Promise.allSettled in runAllDetectors.
  // Observations are also emitted as events so the nightly distiller
  // can lift stable patterns into typed memories the dossier reads.
  let observations: Awaited<ReturnType<typeof import("../../tilly/detectors").runAllDetectors>> = [];
  try {
    const { runAllDetectors } = await import("../../tilly/detectors");
    observations = await runAllDetectors(
      userId,
      householdId,
      now,
      tz,
      variableByCategory,
      cadenceOverrides,
    );
    // Fire-and-forget event emit so the obs reach the memory pipeline.
    if (observations.length > 0) {
      const { emitEvent } = await import("../../tilly/event-emitter");
      const kindMap: Record<string, import("../../tilly/event-emitter").EventKind> = {
        income_classification_gap: "obs_income_classification_gap",
        seasonality: "obs_seasonality",
        subscription_creep: "obs_subscription_creep",
        annual_bill_upcoming: "obs_annual_calendar",
        recurring_obligation: "obs_recurring_obligation_due",
        trip_detected: "obs_trip_detected",
        reclassification_learned: "obs_reclassification_learned",
        nudge_followup: "obs_nudge_followup",
        pattern_explanation: "obs_pattern_explanation",
        projection_accuracy: "obs_projection_recorded",
        multi_month_trend: "obs_multi_month_trend",
      };
      for (const obs of observations) {
        const kind = kindMap[obs.kind];
        if (!kind) continue;
        // Don't await — observations are advisory, not critical path.
        emitEvent({
          userId,
          householdId,
          kind,
          payload: obs as unknown as Record<string, unknown>,
        }).catch((e) => console.warn("obs emit failed:", e));
      }
    }
  } catch (err) {
    console.warn("[smart-tilly] detector batch failed:", err);
  }

  return {
    income,
    monthStart,
    today,
    monthEndIso,
    daysInMonth,
    daysIntoMonth: d,
    daysLeft,
    spentToDate,
    variableSoFar: Math.round(variableSoFar),
    fixedSoFar: Math.round(fixedSoFar),
    recurringSoFar: Math.round(recurringSoFar),
    oneOffSoFar: Math.round(oneOffSoFar),
    recurringBaseLoad,
    committedRest,
    surplus,
    dailyPace,
    projectedSpend,
    projectedClose,
    variableByCategory,
    leverageInsight,
    incomeProjection,
    incomeProjected,
    observations,
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

      // Single source of truth via computeMonthFlow — the old inline
      // version double-counted (sum of plaid_transactions PLUS the
      // expenses mirror) and treated transfers / CC payments as spend.
      // Helper produces real numbers + a forward-look projection that
      // the new hero card consumes.
      const { forecastNextNDays } = await import("../../tilly/forecast");
      const tzNow = new Date();
      let numbers: { breathing: number; afterRent: number; paycheckCopy: string };
      let forecast: Awaited<ReturnType<typeof forecastNextNDays>> = [];
      let monthly:
        | {
            income: number;
            spentToDate: number;
            committedRest: number;
            surplus: number;
            source: string;
          }
        | null = null;
      let forwardLook:
        | (Awaited<ReturnType<typeof computeMonthFlow>> extends infer F
            ? {
                daysIntoMonth: number;
                daysInMonth: number;
                dailyPace: number;
                projectedSpend: number;
                projectedClose: number;
                recurringBaseLoad: number;
                variableSoFar: number;
                fixedSoFar: number;
                recurringSoFar: number;
                oneOffSoFar: number;
                leverageInsight:
                  | { kind: string; text: string; amount: number }
                  | null;
                incomeProjected?: number;
                incomeProjection?: F extends { incomeProjection: infer P } ? P : never;
                observations?: F extends { observations: infer O } ? O : never;
              }
            : never)
        | null = null;
      try {
        const flow = await computeMonthFlow(userId, householdId, tzNow);
        monthly = {
          income: flow.income.amount,
          spentToDate: flow.spentToDate,
          committedRest: flow.committedRest,
          surplus: flow.surplus,
          source: flow.income.source,
        };
        forwardLook = {
          daysIntoMonth: flow.daysIntoMonth,
          daysInMonth: flow.daysInMonth,
          dailyPace: flow.dailyPace,
          projectedSpend: flow.projectedSpend,
          projectedClose: flow.projectedClose,
          recurringBaseLoad: flow.recurringBaseLoad,
          variableSoFar: flow.variableSoFar,
          fixedSoFar: flow.fixedSoFar,
          recurringSoFar: flow.recurringSoFar,
          oneOffSoFar: flow.oneOffSoFar,
          leverageInsight: flow.leverageInsight,
          incomeProjected: flow.incomeProjected,
          incomeProjection: flow.incomeProjection,
          observations: flow.observations,
        };
        // paycheckCopy is now forward-looking: pace + projection, not
        // the old "$X earned · $Y spent · $Z committed" doom string.
        const paycheckCopy =
          flow.income.amount > 0
            ? `~$${flow.dailyPace}/day pace · projected close $${flow.projectedClose >= 0 ? "+" : ""}${flow.projectedClose}`
            : plaidConnected
              ? "Tell Tilly your monthly income to anchor this"
              : "Connect a bank or tell Tilly your income";
        numbers = {
          breathing: Math.max(0, flow.surplus),
          afterRent: Math.max(0, flow.surplus),
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
          // Pass everything computeMonthFlow learned so the LLM can
          // author a heroNarrative anchored on the user's actual
          // patterns (cadence, projection, leverage, observations)
          // instead of a generic template.
          forwardLook: forwardLook
            ? {
                daysIntoMonth: forwardLook.daysIntoMonth,
                daysInMonth: forwardLook.daysInMonth,
                dailyPace: forwardLook.dailyPace,
                projectedClose: forwardLook.projectedClose,
                variableSoFar: forwardLook.variableSoFar,
                fixedSoFar: forwardLook.fixedSoFar,
                incomeProjected: forwardLook.incomeProjected,
                incomeProjection: forwardLook.incomeProjection,
                leverageInsight: forwardLook.leverageInsight,
                observations: forwardLook.observations as Array<{
                  kind: string;
                  [k: string]: unknown;
                }> | undefined,
              }
            : null,
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
        // Forecast-led hero data — pace, projected close, decomposition,
        // and one actionable insight. The client's new BTHome card reads
        // from here when present; falls back to monthly + paycheckCopy
        // when not (so older builds keep rendering coherently).
        forwardLook,
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
        const flow = await computeMonthFlow(userId, householdId, new Date());
        const [yy, mm] = flow.today.split("-");
        res.json({
          ready: true,
          month: `${yy}-${mm}`,
          income: {
            amount: flow.income.amount,
            source: flow.income.source,
            note: flow.income.note ?? null,
          },
          spentToDate: flow.spentToDate,
          committedRest: flow.committedRest,
          surplus: flow.surplus,
          daysLeft: flow.daysLeft,
          forwardLook: {
            daysIntoMonth: flow.daysIntoMonth,
            daysInMonth: flow.daysInMonth,
            dailyPace: flow.dailyPace,
            projectedSpend: flow.projectedSpend,
            projectedClose: flow.projectedClose,
            recurringBaseLoad: flow.recurringBaseLoad,
            variableSoFar: flow.variableSoFar,
            fixedSoFar: flow.fixedSoFar,
            recurringSoFar: flow.recurringSoFar,
            oneOffSoFar: flow.oneOffSoFar,
            leverageInsight: flow.leverageInsight,
            incomeProjected: flow.incomeProjected,
            incomeProjection: flow.incomeProjection,
            observations: flow.observations,
          },
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
          // Bucket key fallback chain: explicit signature → lowercased
          // merchantName → lowercased name. Sandbox Plaid sometimes
          // produces rows with empty signatures (transaction_id-only),
          // and skipping them dropped the parent total → drill-in
          // mismatch the user actually hit. Skip only when ALL three
          // are empty.
          const sig =
            (r.signature || "").trim().toLowerCase() ||
            (r.merchantName || "").trim().toLowerCase() ||
            (r.name || "").trim().toLowerCase();
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
