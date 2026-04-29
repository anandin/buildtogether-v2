/**
 * Protections engine — rule-based generator that watches the user's
 * spend + subscriptions and writes a `protections` row whenever Tilly
 * sees something worth flagging.
 *
 * Designed to be re-runnable (idempotent) — uses a 24h dedupe window so
 * the same observation doesn't write multiple rows. Triggered by:
 *   1. Boot-time / cron — sweeps all households nightly
 *   2. Inline — after a manual expense lands or a Plaid sync completes
 *
 * Surfaces routed to:
 *   - the Credit screen "Tilly protected you" card
 *   - push notifications via the cron fan-out
 *   - the chat retriever (recent protections become RAG context)
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  expenses,
  protections,
  subscriptions,
  households,
  members,
} from "../../shared/schema";

type RuleHit = {
  kind: "free_trial" | "unused_sub" | "unusual_charge" | "overdraft_risk" | "phishing";
  severity: "fyi" | "decision_needed" | "act_today";
  summary: string;
  detail?: string;
  ctaLabel?: string;
  ctaAction?: string;
  subscriptionId?: string;
};

const DEDUPE_WINDOW_HOURS = 24;

/**
 * Run all rules for one household. Returns the set of new protections
 * written (existing dupes get skipped silently).
 */
export async function runProtectionsForHousehold(
  householdId: string,
): Promise<RuleHit[]> {
  const userId = await ownerOf(householdId);
  if (!userId) return [];

  const hits: RuleHit[] = [];

  hits.push(...(await ruleUnusedSubscriptions(householdId)));
  hits.push(...(await ruleFreeTrialConverging(householdId)));
  hits.push(...(await ruleUnusualLargeCharge(householdId)));

  // Persist with dedupe — same kind + same target within 24h becomes a noop.
  const written: RuleHit[] = [];
  for (const h of hits) {
    const dupe = await db
      .select({ id: protections.id })
      .from(protections)
      .where(
        and(
          eq(protections.householdId, householdId),
          eq(protections.kind, h.kind),
          h.subscriptionId
            ? eq(protections.subscriptionId, h.subscriptionId)
            : sql`1 = 1`,
          gte(protections.flaggedAt, sql`NOW() - INTERVAL '${sql.raw(String(DEDUPE_WINDOW_HOURS))} hours'`),
        ),
      )
      .limit(1);
    if (dupe.length > 0) continue;
    await db.insert(protections).values({
      userId,
      householdId,
      kind: h.kind,
      severity: h.severity,
      summary: h.summary,
      detail: h.detail,
      ctaLabel: h.ctaLabel,
      ctaAction: h.ctaAction,
      subscriptionId: h.subscriptionId,
      status: "flagged",
    });
    written.push(h);
  }
  return written;
}

async function ownerOf(householdId: string): Promise<string | null> {
  // Owner = the member with role 'owner'. Falls back to households.id link.
  const row = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.coupleId, householdId), eq(members.role, "owner")))
    .limit(1);
  if (row.length > 0 && row[0].userId) return row[0].userId;
  // Fallback: any member.
  const any = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.coupleId, householdId))
    .limit(1);
  return any[0]?.userId ?? null;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

/**
 * "You haven't used X in 60 days." Reads `subscriptions` table — looks
 * for active rows where lastUsedAt is older than 60 days OR usageNote
 * indicates infrequent use.
 */
async function ruleUnusedSubscriptions(householdId: string): Promise<RuleHit[]> {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const subs = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")))
      .limit(50);
    const stale = subs.filter((s) => {
      if (!s.lastUsedAt) return false;
      return new Date(s.lastUsedAt) < sixtyDaysAgo;
    });
    return stale.map((s) => ({
      kind: "unused_sub" as const,
      severity: "decision_needed" as const,
      summary: `You haven't used ${s.merchant} in 60+ days.`,
      detail: `It renews ${s.cadence}. Pause if you'd rather have the $${s.amount.toFixed(0)} back.`,
      ctaLabel: `Pause ${s.merchant}`,
      ctaAction: `pause_subscription:${s.id}`,
      subscriptionId: s.id,
    }));
  } catch {
    return [];
  }
}

/**
 * Free trials charging the full price within ~5 days. We don't know
 * trial-end dates yet (Plaid doesn't give them); approximate as: a sub
 * with status='active' that's about to bill for the first time.
 */
async function ruleFreeTrialConverging(householdId: string): Promise<RuleHit[]> {
  try {
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const subs = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")))
      .limit(50);
    const converging = subs.filter((s) => {
      if (!s.nextChargeAt) return false;
      // Heuristic: this is the first charge if we have no lastChargedAt
      // and nextChargeAt is within the next 5 days.
      return !s.lastChargedAt && s.nextChargeAt >= today && s.nextChargeAt <= fiveDaysFromNow;
    });
    return converging.map((s) => ({
      kind: "free_trial" as const,
      severity: "act_today" as const,
      summary: `${s.merchant} charges you $${s.amount.toFixed(0)} on ${s.nextChargeAt}.`,
      detail: "Free trial converting. Decide now while it's still free.",
      ctaLabel: `Cancel ${s.merchant}`,
      ctaAction: `cancel_subscription:${s.id}`,
      subscriptionId: s.id,
    }));
  } catch {
    return [];
  }
}

/**
 * Unusual large charge — single expense > 2× the user's 30-day median.
 * Catches one-time hits (concert ticket, plane ticket) that are worth a
 * heads-up but shouldn't auto-block.
 */
async function ruleUnusualLargeCharge(householdId: string): Promise<RuleHit[]> {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recent = await db
      .select({ amount: expenses.amount, merchant: expenses.merchant, description: expenses.description, date: expenses.date })
      .from(expenses)
      .where(and(eq(expenses.coupleId, householdId), gte(expenses.date, since)))
      .orderBy(desc(expenses.date))
      .limit(200);
    if (recent.length < 8) return [];
    const sorted = [...recent].map((r) => r.amount).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const today = new Date().toISOString().slice(0, 10);
    const todayBig = recent.filter((r) => r.date === today && r.amount >= median * 2 && r.amount > 30);
    return todayBig.slice(0, 1).map((e) => ({
      kind: "unusual_charge" as const,
      severity: "fyi" as const,
      summary: `Bigger than usual today: $${e.amount.toFixed(0)} at ${e.merchant ?? e.description}.`,
      detail: `Your typical purchase this month is around $${median.toFixed(0)}.`,
      ctaLabel: "I see it",
      ctaAction: "ack",
    }));
  } catch {
    return [];
  }
}

/**
 * Sweeper — runs over every household. Used by the nightly cron and the
 * "+/- recompute" admin button.
 */
export async function runProtectionsAll(): Promise<{
  households: number;
  written: number;
}> {
  const allHouseholds = await db.select({ id: households.id }).from(households).limit(1000);
  let written = 0;
  for (const h of allHouseholds) {
    try {
      const hits = await runProtectionsForHousehold(h.id);
      written += hits.length;
    } catch (err) {
      console.warn("[protections] household failed:", h.id, err);
    }
  }
  return { households: allHouseholds.length, written };
}
