/**
 * Income review — the confidence guard on the abundance denominator.
 *
 * Phase 0 of the commitment-layer PRD (docs/PRD_COMMITMENT_LAYER.md).
 *
 * Why this exists. Every "you have room" / "this is yours to point
 * somewhere" claim is an underwritten guarantee: it is only true if the
 * income side is right. The 2026-05-16 perception audit found the live
 * account showing ~$6,745/mo against a real ~$15k+, because several real
 * paycheques sat in `transfers` / `credit_adjustment` and never entered
 * the income read at all. Every downstream surface then projected doom
 * off a denominator that was wrong by half.
 *
 * Two independent error directions, both handled here:
 *
 *   UNDER-COUNT — inflow that should be income is bucketed elsewhere.
 *     `detectIncomeClassificationGaps` already finds these; until now the
 *     only way to fix one was to happen to say the right thing in chat.
 *
 *   OVER-COUNT — a one-off transfer classified as income inflates the
 *     projection. `splitAnomalousIncome` already quarantines these, which
 *     makes the number conservative rather than wrong — but a large
 *     quarantined amount still means the month total is understated.
 *
 * The guard turns both into a single verdict. When `blocksSurplusClaims`
 * is true, no surface may assert surplus, room, affordability, or a
 * sweep suggestion. Suppress the claim and ask the question instead.
 * A wrong abundance claim costs more trust than a missing one.
 */
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { plaidTransactions } from "../../shared/schema";
import { detectIncomeClassificationGaps } from "./detectors";
import { getMonthlyIncome, type IncomeSource } from "./income-summary";
import { executeTool, type ToolContext } from "./tools/registry";
import { getUserTimezone } from "./user-tz";

// ─── Thresholds ──────────────────────────────────────────────────────
// Shares are of *plausible* monthly income — counted + unreviewed +
// quarantined — so a single $5k unreviewed stream against a $6k counted
// income reads as ~45%, not 83%. Tuned so the live account's four
// candidates land in "low" and a single small reimbursement does not.

/** At/above this share of plausible income unreviewed → block claims. */
export const BLOCK_UNREVIEWED_SHARE = 0.15;
/** At/above this → surface the note, but claims may still ship. */
export const WARN_UNREVIEWED_SHARE = 0.05;
/** Quarantined deposits understate the month; block above this share. */
export const BLOCK_QUARANTINED_SHARE = 0.25;
export const WARN_QUARANTINED_SHARE = 0.05;
/** Below this many observed paycheques there is no baseline to judge. */
export const MIN_OBSERVED_PAYCHECKS = 2;

/** Detector window, in days — used to monthly-ise its occurrence counts. */
const DETECTOR_WINDOW_DAYS = 60;

export type IncomeConfidenceLevel = "high" | "medium" | "low";

export type IncomeConfidence = {
  level: IncomeConfidenceLevel;
  /** Monthly income currently counted (paycheque-shaped, `ourCategory='income'`). */
  countedMonthly: number;
  /** Monthly inflow the gap detector calls plausibly-income, bucketed
   * elsewhere, and neither confirmed nor dismissed by the user. */
  unreviewedMonthly: number;
  /** Deposits excluded as anomalous this month, awaiting confirmation. */
  quarantinedMonthly: number;
  unreviewedShare: number;
  quarantinedShare: number;
  /** Human-readable, safe to show. Ordered most-severe first. */
  reasons: string[];
  /**
   * When true: no surplus, "room", affordability, or sweep-suggestion
   * copy may ship. Ask the income question instead.
   */
  blocksSurplusClaims: boolean;
};

const RANK: Record<IncomeConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };

/**
 * Pure verdict — no I/O, exhaustively unit-tested. Callers assemble the
 * inputs with `buildIncomeReview`.
 */
export function assessIncomeConfidence(input: {
  countedMonthly: number;
  unreviewedMonthly: number;
  quarantinedMonthly: number;
  observedPaychecks: number;
}): IncomeConfidence {
  const counted = Math.max(0, input.countedMonthly);
  const unreviewed = Math.max(0, input.unreviewedMonthly);
  const quarantined = Math.max(0, input.quarantinedMonthly);
  const plausibleTotal = counted + unreviewed + quarantined;

  const unreviewedShare = plausibleTotal > 0 ? unreviewed / plausibleTotal : 0;
  const quarantinedShare = plausibleTotal > 0 ? quarantined / plausibleTotal : 0;

  // Collected rather than folded into a running variable so the verdict
  // is a pure reduction over the findings — and so `reasons` can be
  // ordered by severity rather than by which check happened to run first.
  const findings: Array<{ level: IncomeConfidenceLevel; reason: string }> = [];
  const demoteTo = (level: IncomeConfidenceLevel, reason: string) => {
    findings.push({ level, reason });
  };

  if (counted <= 0) {
    demoteTo(
      "low",
      plausibleTotal > 0
        ? "Money is arriving, but none of it is classified as income yet."
        : "No income detected yet.",
    );
  } else if (input.observedPaychecks < MIN_OBSERVED_PAYCHECKS) {
    demoteTo(
      "low",
      `Only ${input.observedPaychecks} paycheque${input.observedPaychecks === 1 ? "" : "s"} observed — not enough to establish a baseline.`,
    );
  }

  if (unreviewedShare >= BLOCK_UNREVIEWED_SHARE) {
    demoteTo(
      "low",
      `About ${Math.round(unreviewedShare * 100)}% of what looks like income ($${Math.round(unreviewed).toLocaleString()}/mo) isn't counted as income yet.`,
    );
  } else if (unreviewedShare >= WARN_UNREVIEWED_SHARE) {
    demoteTo(
      "medium",
      `$${Math.round(unreviewed).toLocaleString()}/mo of possible income is still unreviewed.`,
    );
  }

  if (quarantinedShare >= BLOCK_QUARANTINED_SHARE) {
    demoteTo(
      "low",
      `A large deposit ($${Math.round(quarantined).toLocaleString()}) is being held out of the total until you confirm whether it's income.`,
    );
  } else if (quarantinedShare >= WARN_QUARANTINED_SHARE) {
    demoteTo(
      "medium",
      `A deposit ($${Math.round(quarantined).toLocaleString()}) is held out of the total pending confirmation.`,
    );
  }

  const level: IncomeConfidenceLevel = findings.reduce<IncomeConfidenceLevel>(
    (worst, f) => (RANK[f.level] > RANK[worst] ? f.level : worst),
    "high",
  );
  // Stable sort, most severe first — the first reason is the one worth
  // showing when there is only room for one.
  const reasons = [...findings]
    .sort((a, b) => RANK[b.level] - RANK[a.level])
    .map((f) => f.reason);

  return {
    level,
    countedMonthly: Math.round(counted),
    unreviewedMonthly: Math.round(unreviewed),
    quarantinedMonthly: Math.round(quarantined),
    unreviewedShare: Math.round(unreviewedShare * 1000) / 1000,
    quarantinedShare: Math.round(quarantinedShare * 1000) / 1000,
    reasons,
    blocksSurplusClaims: level === "low",
  };
}

// ─── Assembly ────────────────────────────────────────────────────────

export type IncomeReviewCandidate = {
  /** Display label — the merchant as the bank names it. */
  merchant: string;
  /** Where it currently sits (transfers / credit_adjustment / other). */
  currentCategory: string;
  occurrences: number;
  avgAmount: number;
  /** avgAmount × occurrences, normalised to a month. */
  estMonthly: number;
  lastSeenDate: string;
};

export type IncomeReviewDeposit = {
  merchant: string | null;
  amount: number;
  date: string;
};

export type IncomeReview = {
  confidence: IncomeConfidence;
  source: IncomeSource;
  /** Inflow that may be income but isn't counted — "is this a paycheque?" */
  candidates: IncomeReviewCandidate[];
  /** Large deposits held out of the total — "is this real income?" */
  quarantinedDeposits: IncomeReviewDeposit[];
  /** True when there is nothing for the user to decide. */
  clean: boolean;
};

/** Monthly-ise a detector candidate observed over its 60-day window. */
export function estimateMonthlyFromWindow(
  avgAmount: number,
  occurrences: number,
  windowDays: number = DETECTOR_WINDOW_DAYS,
): number {
  if (occurrences <= 0 || avgAmount <= 0) return 0;
  return (avgAmount * occurrences * 30) / windowDays;
}

/**
 * Everything the user needs to decide, plus the verdict. Safe to call on
 * every home render — three indexed reads.
 */
export async function buildIncomeReview(
  userId: string,
  householdId: string,
  now: Date = new Date(),
): Promise<IncomeReview> {
  const tz = await getUserTimezone(userId);

  const [income, gaps, paycheckCount] = await Promise.all([
    getMonthlyIncome(userId, householdId, now),
    detectIncomeClassificationGaps(householdId, now, tz, userId),
    countObservedPaychecks(householdId),
  ]);

  const candidates: IncomeReviewCandidate[] = (gaps?.candidates ?? []).map((c) => ({
    merchant: c.merchant,
    currentCategory: c.currentCategory,
    occurrences: c.occurrences,
    avgAmount: Math.round(c.avgAmount),
    estMonthly: Math.round(estimateMonthlyFromWindow(c.avgAmount, c.occurrences)),
    lastSeenDate: c.lastSeenDate,
  }));

  const quarantinedDeposits: IncomeReviewDeposit[] = (income.excluded ?? []).map((e) => ({
    merchant: e.merchant,
    amount: Math.round(Math.abs(e.amount)),
    date: e.date,
  }));

  const confidence = assessIncomeConfidence({
    countedMonthly: income.amount,
    unreviewedMonthly: candidates.reduce((s, c) => s + c.estMonthly, 0),
    quarantinedMonthly: quarantinedDeposits.reduce((s, d) => s + d.amount, 0),
    observedPaychecks: paycheckCount,
  });

  return {
    confidence,
    source: income.source,
    candidates,
    quarantinedDeposits,
    clean: candidates.length === 0 && quarantinedDeposits.length === 0,
  };
}

/** Distinct income rows on file — the baseline check, not a month total. */
async function countObservedPaychecks(householdId: string): Promise<number> {
  const rows = await db
    .select({ date: plaidTransactions.date, amount: plaidTransactions.amount })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
      ),
    )
    .limit(200);
  const seen = new Set(rows.map((r) => `${r.date}|${Math.abs(r.amount).toFixed(2)}`));
  return seen.size;
}

// ─── Decisions ───────────────────────────────────────────────────────

export type IncomeDecision =
  /** "Yes, that's a paycheque" — reclassifies retroactively. */
  | { action: "confirm_income"; sourceName: string }
  /** "No, stop asking" — records a dismissal the detector honours. */
  | { action: "not_income"; sourceName: string }
  /** "That big deposit is real income" — counts it as a one-off. */
  | { action: "confirm_deposit"; sourceName: string; date?: string; amount?: number }
  /**
   * "That big deposit is a transfer, not income" — flips it out of
   * `income` entirely. Without this the quarantined list has no exit for
   * a genuine inter-account move: it stays excluded (correct) but keeps
   * asking (wrong), and a card that nags after being answered is exactly
   * the kind of thing that gets an app closed.
   */
  | { action: "deposit_is_transfer"; sourceName: string };

/**
 * Apply a one-tap decision. Deliberately routes through the existing
 * chat tools rather than reimplementing their writes — the tools own the
 * merchant matching, alias rules and retroactive reclassification, and
 * the review card must not drift from what Tilly does in conversation.
 * The only thing skipped is the LLM that would otherwise have to guess
 * which tool the user meant.
 */
export async function applyIncomeDecision(
  decision: IncomeDecision,
  ctx: ToolContext,
): Promise<{ ok: boolean; result: unknown }> {
  switch (decision.action) {
    case "confirm_income": {
      const result = await executeTool(
        "flagAsIncome",
        { sourceName: decision.sourceName, reason: "confirmed via income review" },
        ctx,
      );
      return { ok: result !== null, result };
    }
    case "not_income": {
      const result = await executeTool(
        "dismissAsNotIncome",
        { sourceName: decision.sourceName, reason: "dismissed via income review" },
        ctx,
      );
      return { ok: result !== null, result };
    }
    case "confirm_deposit": {
      const result = await executeTool(
        "confirmDepositAsIncome",
        {
          sourceName: decision.sourceName,
          ...(decision.date ? { date: decision.date } : {}),
          ...(decision.amount ? { amount: decision.amount } : {}),
        },
        ctx,
      );
      return { ok: result !== null, result };
    }
    case "deposit_is_transfer": {
      const result = await executeTool(
        "markIncomeAsTransfer",
        { sourceName: decision.sourceName, reason: "marked transfer via income review" },
        ctx,
      );
      return { ok: result !== null, result };
    }
  }
}
