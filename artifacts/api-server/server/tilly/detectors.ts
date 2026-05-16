/**
 * Smart Tilly detectors — twelve pattern detectors that turn Tilly from
 * a per-call calculator into a learning agent.
 *
 * Each detector is a pure-ish async function that takes (userId,
 * householdId, now, tz) and returns a typed observation (or null when
 * the pattern doesn't fire). computeMonthFlow runs them in parallel
 * and ships the results in forwardLook.observations. The observation
 * is also written to tilly_events so the nightly distiller can lift
 * stable patterns into typed memories the dossier reads on the next
 * chat turn.
 *
 * Items 1 (paycheck cadence projection) is implemented in
 * income-summary.ts — kept there because it's structurally part of
 * the income calc, not a side-channel detector. The other 11 live
 * here.
 */
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  plaidTransactions,
  subscriptions,
  tillyNudges,
  tillyDossiers,
  userPreferences,
} from "../../shared/schema";
import { localDateString, localDaysAgoIso } from "./user-tz";
import { merchantSignature } from "./merchant-rules";

const ADJUSTMENT_CATS = new Set(["transfers", "cashback", "credit_adjustment"]);

// ────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────

const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

const monthBoundsIso = (
  iso: string,
): { startIso: string; endIso: string } => {
  const [y, m] = iso.split("-").map((n) => parseInt(n, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    startIso: `${y}-${String(m).padStart(2, "0")}-01`,
    endIso: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
};

// ────────────────────────────────────────────────────────────────────
// #2 Income classification gap
// ────────────────────────────────────────────────────────────────────
// Pattern: same merchant deposits ≥2× over 60d but ourCategory is NOT
// 'income'. Likely roommate rent, side gig, parental contribution
// being mis-bucketed as transfer/other. Returns the merchant + count
// + average inflow so the chat can ask "is X actual income?"

export type IncomeClassificationGap = {
  kind: "income_classification_gap";
  candidates: Array<{
    merchant: string;
    occurrences: number;
    avgAmount: number;
    lastSeenDate: string;
    currentCategory: string;
  }>;
};

export async function detectIncomeClassificationGaps(
  householdId: string,
  now: Date,
  tz: string,
  userId?: string,
): Promise<IncomeClassificationGap | null> {
  const sinceIso = localDaysAgoIso(now, tz, 60);
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
      date: plaidTransactions.date,
      ourCategory: plaidTransactions.ourCategory,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, sinceIso),
        sql`${plaidTransactions.amount} < 0`, // inflows only (Plaid signs income negative)
      ),
    );

  // Pull the user's dismissals so we never re-flag merchants they've
  // already said "no, this isn't income, stop suggesting it" for. The
  // dismissAsNotIncome tool writes scope='taxonomy' key='dismissed_as_income.<sig>'.
  // Without this read, the detector kept surfacing TD Trust Toronto +
  // Preauth Pymt + Thank You TD even after the user dismissed them,
  // which is exactly the bug surfaced 2026-05-16.
  const dismissedSigs = new Set<string>();
  if (userId) {
    try {
      const dismissals = await db
        .select({ key: userPreferences.key })
        .from(userPreferences)
        .where(
          and(
            eq(userPreferences.userId, userId),
            eq(userPreferences.scope, "taxonomy"),
          ),
        );
      for (const d of dismissals) {
        if (d.key.startsWith("dismissed_as_income.")) {
          dismissedSigs.add(d.key.slice("dismissed_as_income.".length));
        }
      }
    } catch (err) {
      // Non-fatal — failure to read prefs just means we may re-flag
      // dismissed merchants; the user can dismiss again.
      console.warn("[detector] dismissals fetch failed:", err);
    }
  }

  // Use the SAME merchantSignature helper the dismiss tool uses, so a
  // dismissal pref keyed on sig X matches a detector row with sig X.
  // The previous local sigFor() produced "preauthorized payment" while
  // the tool's merchantSignature() produced "preauthorized" for the
  // same row — so dismissals didn't filter. Caught in live verification.
  const byMerchant = new Map<
    string,
    { sig: string; count: number; sum: number; lastDate: string; cat: string }
  >();
  for (const r of rows) {
    const cat = (r.ourCategory ?? "").toLowerCase();
    if (cat === "income") continue;
    const merch = (r.merchantName ?? r.name ?? "").trim().toLowerCase();
    if (!merch) continue;
    const sig = merchantSignature({
      merchantName: r.merchantName ?? null,
      name: r.name ?? "",
      amount: r.amount,
    });
    if (dismissedSigs.has(sig)) continue; // user already said no
    const e = byMerchant.get(merch) ?? { sig, count: 0, sum: 0, lastDate: r.date, cat };
    e.count += 1;
    e.sum += Math.abs(r.amount);
    if (r.date > e.lastDate) e.lastDate = r.date;
    e.cat = cat || "other";
    byMerchant.set(merch, e);
  }

  const candidates = [...byMerchant.entries()]
    .filter(([, v]) => v.count >= 2 && v.sum / v.count >= 100) // ≥2 hits, avg ≥$100
    .map(([merchant, v]) => ({
      merchant,
      occurrences: v.count,
      avgAmount: Math.round((v.sum / v.count) * 100) / 100,
      lastSeenDate: v.lastDate,
      currentCategory: v.cat,
    }))
    .sort((a, b) => b.avgAmount * b.occurrences - a.avgAmount * a.occurrences)
    .slice(0, 5);

  if (candidates.length === 0) return null;
  return { kind: "income_classification_gap", candidates };
}

// ────────────────────────────────────────────────────────────────────
// #3 Bonus / refund seasonality
// ────────────────────────────────────────────────────────────────────
// Compare this month's income to same month last year. If notably
// higher, surface possible recurring bonus / refund. Skipped if no
// Y-1 data. Threshold: this month inflow > 1.4× same-month-last-year.

export type Seasonality = {
  kind: "seasonality";
  thisMonthIncome: number;
  yearAgoSameMonthIncome: number;
  ratio: number;
  hint: string;
};

export async function detectSeasonality(
  householdId: string,
  now: Date,
  tz: string,
): Promise<Seasonality | null> {
  const todayIso = localDateString(now, tz);
  const yearAgoIso = (() => {
    const [y, m, d] = todayIso.split("-").map((n) => parseInt(n, 10));
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  })();
  const thisMonth = monthBoundsIso(todayIso);
  const yearAgoMonth = monthBoundsIso(yearAgoIso);

  const sumIncome = async (start: string, end: string): Promise<number> => {
    const rows = await db
      .select({ amount: plaidTransactions.amount })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.ourCategory, "income"),
          gte(plaidTransactions.date, start),
          lte(plaidTransactions.date, end),
        ),
      );
    return rows.reduce((s, r) => s + Math.abs(r.amount), 0);
  };

  const [thisInc, yaInc] = await Promise.all([
    sumIncome(thisMonth.startIso, thisMonth.endIso),
    sumIncome(yearAgoMonth.startIso, yearAgoMonth.endIso),
  ]);
  if (yaInc < 100) return null; // need real prior-year baseline
  const ratio = thisInc / yaInc;
  if (ratio < 1.4) return null;
  return {
    kind: "seasonality",
    thisMonthIncome: Math.round(thisInc),
    yearAgoSameMonthIncome: Math.round(yaInc),
    ratio: Math.round(ratio * 100) / 100,
    hint:
      ratio > 1.8
        ? "Looks like a bonus or refund landed this month — same shape as a year ago."
        : "Income's running heavier than the same month last year. Bonus, refund, or extra cheque?",
  };
}

// ────────────────────────────────────────────────────────────────────
// #4 Subscription creep
// ────────────────────────────────────────────────────────────────────
// Sum subscription charges per month over trailing 6 months. If
// current month's load is >110% of 6-mo trailing avg, surface the
// drift. Catches the slow-add sub creep that's invisible per-month
// but crushing in aggregate.

export type SubscriptionCreep = {
  kind: "subscription_creep";
  currentMonthLoad: number;
  trailingAvgLoad: number;
  growthPct: number;
  hint: string;
};

export async function detectSubscriptionCreep(
  householdId: string,
  now: Date,
  tz: string,
): Promise<SubscriptionCreep | null> {
  const todayIso = localDateString(now, tz);
  const [y, m] = todayIso.split("-").map((n) => parseInt(n, 10));
  const monthlyLoads: number[] = [];
  let currentMonthLoad = 0;
  for (let back = 0; back < 7; back++) {
    let yy = y;
    let mm = m - back;
    while (mm < 1) {
      mm += 12;
      yy -= 1;
    }
    const startIso = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const endIso = `${yy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const rows = await db
      .select({ amount: plaidTransactions.amount })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.ourCategory, "subscriptions"),
          gte(plaidTransactions.date, startIso),
          lte(plaidTransactions.date, endIso),
        ),
      );
    const sum = rows.reduce((s, r) => s + Math.abs(r.amount), 0);
    if (back === 0) currentMonthLoad = sum;
    else monthlyLoads.push(sum);
  }
  if (monthlyLoads.length < 3) return null;
  const trailingAvg = monthlyLoads.reduce((s, v) => s + v, 0) / monthlyLoads.length;
  if (trailingAvg < 30) return null;
  const growthPct = ((currentMonthLoad - trailingAvg) / trailingAvg) * 100;
  if (growthPct < 10) return null;
  return {
    kind: "subscription_creep",
    currentMonthLoad: Math.round(currentMonthLoad),
    trailingAvgLoad: Math.round(trailingAvg),
    growthPct: Math.round(growthPct),
    hint: `Sub load up $${Math.round(currentMonthLoad - trailingAvg)}/mo vs trailing 6-mo avg. Worth pruning?`,
  };
}

// ────────────────────────────────────────────────────────────────────
// #5 Annual / quarterly bill calendar
// ────────────────────────────────────────────────────────────────────
// Scan trailing 13 months for same-merchant high-value charges
// (>=$300) that landed once or twice per year. Use historical landing
// pattern to predict next occurrence. Surface upcoming ones in the
// next 60 days so the projection isn't surprised.

export type AnnualBill = {
  kind: "annual_bill_upcoming";
  bills: Array<{
    merchant: string;
    typicalAmount: number;
    cadence: "annual" | "quarterly" | "semiannual";
    expectedNextDate: string;
    daysUntil: number;
  }>;
};

export async function detectAnnualBillCalendar(
  householdId: string,
  now: Date,
  tz: string,
  cadenceOverrides: Map<string, string> = new Map(),
): Promise<AnnualBill | null> {
  const todayIso = localDateString(now, tz);
  const sinceIso = (() => {
    const [y, m, d] = todayIso.split("-").map((n) => parseInt(n, 10));
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  })();
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
      date: plaidTransactions.date,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, sinceIso),
        sql`${plaidTransactions.amount} >= 300`,
      ),
    );

  const byMerchant = new Map<string, { dates: string[]; sum: number }>();
  for (const r of rows) {
    const merch = (r.merchantName ?? r.name ?? "").trim().toLowerCase();
    if (!merch) continue;
    const e = byMerchant.get(merch) ?? { dates: [], sum: 0 };
    e.dates.push(r.date);
    e.sum += r.amount;
    byMerchant.set(merch, e);
  }

  const bills: AnnualBill["bills"] = [];
  for (const [merchant, v] of byMerchant.entries()) {
    if (v.dates.length < 1 || v.dates.length > 4) continue; // 1-4 hits per year is bill-shape
    const sortedDates = [...v.dates].sort();
    const lastDate = sortedDates[sortedDates.length - 1];
    const avgAmount = v.sum / v.dates.length;
    let cadence: "annual" | "quarterly" | "semiannual";
    let nextDate: string;
    // User override beats inference — if they told Tilly "TD Visa
    // Preauth Pymt is monthly, not semiannual", the override is in
    // cadenceOverrides (keyed by merchant signature or lowercased
    // sourceName). Override values can be "monthly" or "never" which
    // mean "don't surface this as an upcoming annual bill" — skip.
    const override = cadenceOverrides.get(merchant);
    if (override === "monthly" || override === "biweekly" || override === "weekly" || override === "never") {
      continue;
    }
    if (override === "annual" || override === "semiannual" || override === "quarterly") {
      cadence = override;
      nextDate =
        override === "annual"
          ? addDaysIso(lastDate, 365)
          : override === "semiannual"
            ? addDaysIso(lastDate, 182)
            : addDaysIso(lastDate, 90);
    } else if (v.dates.length === 1) {
      cadence = "annual";
      nextDate = (() => {
        const [yy, mm, dd] = lastDate.split("-").map((n) => parseInt(n, 10));
        return `${yy + 1}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      })();
    } else if (v.dates.length === 2) {
      cadence = "semiannual";
      const gap = (() => {
        const a = new Date(sortedDates[0] + "T00:00:00Z").getTime();
        const b = new Date(sortedDates[1] + "T00:00:00Z").getTime();
        return Math.round((b - a) / (24 * 3600 * 1000));
      })();
      nextDate = addDaysIso(lastDate, gap);
    } else {
      cadence = "quarterly";
      nextDate = addDaysIso(lastDate, 90);
    }
    const daysUntil = (() => {
      const t = new Date(todayIso + "T00:00:00Z").getTime();
      const n = new Date(nextDate + "T00:00:00Z").getTime();
      return Math.round((n - t) / (24 * 3600 * 1000));
    })();
    if (daysUntil > 60 || daysUntil < -10) continue; // surface only the near horizon
    bills.push({
      merchant,
      typicalAmount: Math.round(avgAmount),
      cadence,
      expectedNextDate: nextDate,
      daysUntil,
    });
  }
  if (bills.length === 0) return null;
  bills.sort((a, b) => a.daysUntil - b.daysUntil);
  return { kind: "annual_bill_upcoming", bills: bills.slice(0, 5) };
}

// ────────────────────────────────────────────────────────────────────
// #6 Recurring obligation prediction
// ────────────────────────────────────────────────────────────────────
// For each row in subscriptions, check if it's expected this month
// based on cadence + lastChargedAt, and whether it's already hit.
// Surface the not-yet-hit ones with their typical landing date.

export type RecurringObligation = {
  kind: "recurring_obligation";
  obligations: Array<{
    merchant: string;
    amount: number;
    expectedDate: string;
    alreadyHit: boolean;
    cadence: string;
  }>;
};

export async function detectRecurringObligations(
  householdId: string,
  now: Date,
  tz: string,
): Promise<RecurringObligation | null> {
  const todayIso = localDateString(now, tz);
  const { startIso, endIso } = monthBoundsIso(todayIso);
  const subs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.householdId, householdId),
        eq(subscriptions.status, "active"),
      ),
    );
  const obligations: RecurringObligation["obligations"] = [];
  for (const s of subs) {
    const last = s.lastChargedAt?.slice(0, 10) ?? null;
    const next = s.nextChargeAt?.slice(0, 10) ?? null;
    const expected = next || (last ? addDaysIso(last, 30) : null);
    if (!expected) continue;
    if (expected < startIso || expected > endIso) continue;
    obligations.push({
      merchant: s.merchant,
      amount: Math.round(s.amount),
      expectedDate: expected,
      alreadyHit: !!last && last >= startIso,
      cadence: s.cadence,
    });
  }
  if (obligations.length === 0) return null;
  obligations.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  return { kind: "recurring_obligation", obligations };
}

// ────────────────────────────────────────────────────────────────────
// #7 Trip / event detection
// ────────────────────────────────────────────────────────────────────
// Spend density burst at travel-shaped categories over 1-7 days above
// $400 total. Bucket separately so daily-pace projection isn't
// poisoned by a one-off trip.

export type TripDetection = {
  kind: "trip_detected";
  trips: Array<{
    startDate: string;
    endDate: string;
    days: number;
    totalAmount: number;
    primaryMerchant: string;
  }>;
};

export async function detectTripsAndEvents(
  householdId: string,
  now: Date,
  tz: string,
): Promise<TripDetection | null> {
  const sinceIso = localDaysAgoIso(now, tz, 60);
  const rows = await db
    .select({
      amount: plaidTransactions.amount,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
      date: plaidTransactions.date,
      personalFinanceCategory: plaidTransactions.personalFinanceCategory,
      ourCategory: plaidTransactions.ourCategory,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, sinceIso),
        sql`${plaidTransactions.amount} > 0`,
      ),
    );
  // Travel-shaped: PFC primary in TRAVEL group, or merchant signal
  // (hotel, airbnb, airline, marriott, hilton, expedia, booking).
  const TRAVEL_RE = /hotel|airbnb|marriott|hilton|expedia|booking|hyatt|airlines?|delta|united|aircanada|westjet|porter|ryanair/i;
  const travelRows = rows.filter((r) => {
    const pfcPrim =
      typeof r.personalFinanceCategory === "object" && r.personalFinanceCategory
        ? String((r.personalFinanceCategory as Record<string, unknown>).primary ?? "")
        : "";
    if (pfcPrim.startsWith("TRAVEL")) return true;
    const text = `${r.merchantName ?? ""} ${r.name ?? ""}`;
    return TRAVEL_RE.test(text);
  });
  if (travelRows.length === 0) return null;

  // Cluster by date — any consecutive-day travel rows form a trip.
  travelRows.sort((a, b) => a.date.localeCompare(b.date));
  const trips: TripDetection["trips"] = [];
  let cluster: typeof travelRows = [];
  const flush = () => {
    if (cluster.length === 0) return;
    const total = cluster.reduce((s, r) => s + r.amount, 0);
    if (total < 400) {
      cluster = [];
      return;
    }
    const startDate = cluster[0].date;
    const endDate = cluster[cluster.length - 1].date;
    const days =
      Math.round(
        (new Date(endDate + "T00:00:00Z").getTime() -
          new Date(startDate + "T00:00:00Z").getTime()) /
          (24 * 3600 * 1000),
      ) + 1;
    const merchCounts = new Map<string, number>();
    for (const r of cluster) {
      const m = (r.merchantName ?? r.name ?? "unknown").trim();
      merchCounts.set(m, (merchCounts.get(m) ?? 0) + 1);
    }
    const primaryMerchant = [...merchCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    trips.push({
      startDate,
      endDate,
      days,
      totalAmount: Math.round(total),
      primaryMerchant,
    });
    cluster = [];
  };
  for (const r of travelRows) {
    if (cluster.length === 0) {
      cluster.push(r);
      continue;
    }
    const last = cluster[cluster.length - 1].date;
    const gap =
      (new Date(r.date + "T00:00:00Z").getTime() -
        new Date(last + "T00:00:00Z").getTime()) /
      (24 * 3600 * 1000);
    if (gap <= 7) cluster.push(r);
    else {
      flush();
      cluster.push(r);
    }
  }
  flush();
  if (trips.length === 0) return null;
  return { kind: "trip_detected", trips: trips.slice(-3) };
}

// ────────────────────────────────────────────────────────────────────
// #8 Reclassification persistence (read-side helper)
// ────────────────────────────────────────────────────────────────────
// The write-side already exists in tools/registry.ts (markPayment-
// ToOwnCard, markIncomeAsTransfer, hideCategoryFromSpend). What was
// missing: surface what's been LEARNED so the user/Tilly can review
// and revoke. Returns active learned-rule prefs.

export type ReclassificationLearned = {
  kind: "reclassification_learned";
  rules: Array<{
    scope: string;
    key: string;
    value: unknown;
    learnedAt: string;
  }>;
};

export async function detectReclassificationLearned(
  userId: string,
): Promise<ReclassificationLearned | null> {
  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  const rules = rows
    .filter((r) =>
      r.key.startsWith("plaid.alias_payment_to_card:") ||
      r.key.startsWith("income.alias_to_transfer:") ||
      r.key.startsWith("spend.hide_categories") ||
      r.key.startsWith("plaid.merchant_rename:"),
    )
    .map((r) => ({
      scope: r.scope,
      key: r.key,
      value: r.value,
      learnedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
    }))
    .slice(0, 20);
  if (rules.length === 0) return null;
  return { kind: "reclassification_learned", rules };
}

// ────────────────────────────────────────────────────────────────────
// #9 Nudge follow-up
// ────────────────────────────────────────────────────────────────────
// Query tilly_nudges where outcome IS NULL and sent_at > 14d ago.
// Tilly can reference these in chat: "Two weeks ago you said you'd
// review the Spotify sub — still on the list?"

export type NudgeFollowup = {
  kind: "nudge_followup";
  pendingNudges: Array<{
    id: string;
    frame: string;
    sentAt: string;
    daysAgo: number;
    payload: Record<string, unknown>;
  }>;
};

export async function detectNudgeFollowups(
  userId: string,
  now: Date,
): Promise<NudgeFollowup | null> {
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const rows = await db
    .select()
    .from(tillyNudges)
    .where(
      and(
        eq(tillyNudges.userId, userId),
        sql`${tillyNudges.outcome} IS NULL`,
        sql`${tillyNudges.sentAt} <= ${fourteenDaysAgo.toISOString()}`,
      ),
    )
    .orderBy(desc(tillyNudges.sentAt))
    .limit(5);
  if (rows.length === 0) return null;
  return {
    kind: "nudge_followup",
    pendingNudges: rows.map((r) => ({
      id: r.id,
      frame: r.frame,
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : "",
      daysAgo: r.sentAt
        ? Math.floor((now.getTime() - new Date(r.sentAt).getTime()) / (24 * 3600 * 1000))
        : 0,
      payload: (r.context ?? {}) as Record<string, unknown>,
    })),
  };
}

// ────────────────────────────────────────────────────────────────────
// #10 Pattern explanation from dossier
// ────────────────────────────────────────────────────────────────────
// When a category is over its trailing average this month, look up
// the user's dossier sections (recent_decisions, money_arc) for any
// past memo that mentions the same category. Surface as "you noted X
// last time this happened" so Tilly's commentary feels contextual.

export type PatternExplanation = {
  kind: "pattern_explanation";
  spikedCategory: string;
  thisMonthAmount: number;
  trailingAvg: number;
  explanation: string | null;
};

export async function detectPatternExplanation(
  userId: string,
  householdId: string,
  now: Date,
  tz: string,
  variableByCategory: Map<string, number>,
): Promise<PatternExplanation | null> {
  // Pick the biggest category this month.
  const top = [...variableByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 200) return null;
  const [cat, thisAmt] = top;

  // Compute trailing 3-month average for this category.
  const todayIso = localDateString(now, tz);
  const [y, m] = todayIso.split("-").map((n) => parseInt(n, 10));
  const monthSums: number[] = [];
  for (let back = 1; back <= 3; back++) {
    let yy = y;
    let mm = m - back;
    while (mm < 1) {
      mm += 12;
      yy -= 1;
    }
    const startIso = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const endIso = `${yy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const rows = await db
      .select({ amount: plaidTransactions.amount })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.ourCategory, cat),
          gte(plaidTransactions.date, startIso),
          lte(plaidTransactions.date, endIso),
        ),
      );
    monthSums.push(rows.reduce((s, r) => s + Math.abs(r.amount), 0));
  }
  if (monthSums.length === 0) return null;
  const trailingAvg = monthSums.reduce((s, v) => s + v, 0) / monthSums.length;
  if (thisAmt < trailingAvg * 1.4) return null;

  // Look in dossier for matching mention.
  const dossierRow = await db
    .select()
    .from(tillyDossiers)
    .where(eq(tillyDossiers.userId, userId))
    .orderBy(desc(tillyDossiers.generatedAt))
    .limit(1);
  let explanation: string | null = null;
  if (dossierRow[0]?.content) {
    const dossier = dossierRow[0].content as Record<string, unknown>;
    const sections = ["recent_decisions", "money_arc", "soft_spots", "open_loops"];
    for (const section of sections) {
      const entries = dossier[section];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const text = typeof entry === "string" ? entry : JSON.stringify(entry);
        if (text.toLowerCase().includes(cat.toLowerCase())) {
          explanation = text.slice(0, 200);
          break;
        }
      }
      if (explanation) break;
    }
  }
  return {
    kind: "pattern_explanation",
    spikedCategory: cat,
    thisMonthAmount: Math.round(thisAmt),
    trailingAvg: Math.round(trailingAvg),
    explanation,
  };
}

// ────────────────────────────────────────────────────────────────────
// #11 Projection error tracking
// ────────────────────────────────────────────────────────────────────
// At month rollover, record predicted_close vs actual_close for the
// PRIOR month. Use the running history to surface accuracy stats.
// Recording happens via a separate cron; this detector READS the
// most recent record so the hero can show "Tilly's projections have
// been within $X on average."

export type ProjectionAccuracy = {
  kind: "projection_accuracy";
  recordedMonths: number;
  meanAbsoluteError: number;
  lastMonth: { month: string; predicted: number; actual: number; error: number } | null;
};

export async function detectProjectionAccuracy(
  householdId: string,
): Promise<ProjectionAccuracy | null> {
  const rows = await db.execute(
    sql`SELECT month, predicted_close, actual_close
        FROM projection_history
        WHERE household_id = ${householdId}
        ORDER BY month DESC
        LIMIT 6`,
  );
  // drizzle's .execute returns a result object; rows live on .rows in pg
  const items = (rows as unknown as { rows?: Array<{ month: string; predicted_close: number; actual_close: number }> }).rows
    ?? (rows as unknown as Array<{ month: string; predicted_close: number; actual_close: number }>);
  if (!items || items.length === 0) return null;
  const errs = items.map((r) => Math.abs(r.predicted_close - r.actual_close));
  const mae = errs.reduce((s, v) => s + v, 0) / errs.length;
  const last = items[0];
  return {
    kind: "projection_accuracy",
    recordedMonths: items.length,
    meanAbsoluteError: Math.round(mae),
    lastMonth: {
      month: last.month,
      predicted: Math.round(last.predicted_close),
      actual: Math.round(last.actual_close),
      error: Math.round(last.predicted_close - last.actual_close),
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// #12 Multi-month income vs spend trend
// ────────────────────────────────────────────────────────────────────
// Trailing 6 months of (income - real burn). Classify trend as
// improving / flat / worsening with concrete numbers. Surfaces the
// "your March-April improvement is real" narrative.

export type MultiMonthTrend = {
  kind: "multi_month_trend";
  monthsAnalyzed: number;
  trailingNets: Array<{ month: string; income: number; spend: number; net: number }>;
  trendDirection: "improving" | "flat" | "worsening";
  hint: string;
};

export async function detectMultiMonthTrend(
  householdId: string,
  now: Date,
  tz: string,
): Promise<MultiMonthTrend | null> {
  const todayIso = localDateString(now, tz);
  const [y, m] = todayIso.split("-").map((n) => parseInt(n, 10));
  const trailingNets: MultiMonthTrend["trailingNets"] = [];
  for (let back = 1; back <= 6; back++) {
    let yy = y;
    let mm = m - back;
    while (mm < 1) {
      mm += 12;
      yy -= 1;
    }
    const startIso = `${yy}-${String(mm).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const endIso = `${yy}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const rows = await db
      .select({
        amount: plaidTransactions.amount,
        ourCategory: plaidTransactions.ourCategory,
      })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          gte(plaidTransactions.date, startIso),
          lte(plaidTransactions.date, endIso),
        ),
      );
    let income = 0;
    let spend = 0;
    for (const r of rows) {
      const cat = (r.ourCategory ?? "").toLowerCase();
      if (cat === "income") income += Math.abs(r.amount);
      else if (ADJUSTMENT_CATS.has(cat)) continue;
      else spend += Math.abs(r.amount);
    }
    trailingNets.push({
      month: `${yy}-${String(mm).padStart(2, "0")}`,
      income: Math.round(income),
      spend: Math.round(spend),
      net: Math.round(income - spend),
    });
  }
  if (trailingNets.length < 3) return null;
  trailingNets.reverse(); // oldest first

  // Linear-ish trend: compare first half average net to second half.
  const half = Math.floor(trailingNets.length / 2);
  const firstHalfAvg = trailingNets.slice(0, half).reduce((s, r) => s + r.net, 0) / half;
  const secondHalfAvg = trailingNets.slice(-half).reduce((s, r) => s + r.net, 0) / half;
  const swing = secondHalfAvg - firstHalfAvg;

  let trendDirection: MultiMonthTrend["trendDirection"];
  let hint: string;
  if (swing > 200) {
    trendDirection = "improving";
    hint = `Net up $${Math.round(swing)}/mo over the last few months — real, not noise.`;
  } else if (swing < -200) {
    trendDirection = "worsening";
    hint = `Net down $${Math.round(-swing)}/mo trend. Worth a closer look at where the weight came from.`;
  } else {
    trendDirection = "flat";
    hint = `Holding steady. Net within $${Math.round(Math.abs(swing))}/mo of trailing.`;
  }
  return {
    kind: "multi_month_trend",
    monthsAnalyzed: trailingNets.length,
    trailingNets,
    trendDirection,
    hint,
  };
}

// ────────────────────────────────────────────────────────────────────
// Unified runner
// ────────────────────────────────────────────────────────────────────

export type Observation =
  | IncomeClassificationGap
  | Seasonality
  | SubscriptionCreep
  | AnnualBill
  | RecurringObligation
  | TripDetection
  | ReclassificationLearned
  | NudgeFollowup
  | PatternExplanation
  | ProjectionAccuracy
  | MultiMonthTrend;

export async function runAllDetectors(
  userId: string,
  householdId: string,
  now: Date,
  tz: string,
  variableByCategory: Map<string, number>,
  cadenceOverrides: Map<string, string> = new Map(),
): Promise<Observation[]> {
  const results = await Promise.allSettled([
    detectIncomeClassificationGaps(householdId, now, tz, userId),
    detectSeasonality(householdId, now, tz),
    detectSubscriptionCreep(householdId, now, tz),
    detectAnnualBillCalendar(householdId, now, tz, cadenceOverrides),
    detectRecurringObligations(householdId, now, tz),
    detectTripsAndEvents(householdId, now, tz),
    detectReclassificationLearned(userId),
    detectNudgeFollowups(userId, now),
    detectPatternExplanation(userId, householdId, now, tz, variableByCategory),
    detectProjectionAccuracy(householdId),
    detectMultiMonthTrend(householdId, now, tz),
  ]);
  const out: Observation[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) out.push(r.value);
  }
  return out;
}
