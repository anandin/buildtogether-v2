/**
 * Protective surface — spec §5.7.
 *
 * Runs detectors over Plaid + subscription data, emits rows into the
 * `protections` table. The Home subscription tile + Credit "Tilly
 * protected you · 24h" card both read from `protections`.
 *
 * Detectors implemented in Phase 5:
 *   - unusedSubscriptionDetector — sub.lastUsedAt > 60d, fyi/decision
 *   - freeTrialDetector — small intro charge (≤$1 or "free trial")
 *     followed by an upcoming larger first real charge
 *
 * Detectors NOT yet implemented (future):
 *   - phishingTextDetector — needs SMS forwarding inbox
 *   - unusualChargeDetector — outlier from the user's pattern
 *   - overdraftRiskDetector — spending velocity vs upcoming bills
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  subscriptions,
  protections,
  plaidTransactions,
  members,
} from "../../shared/schema";

export type DetectorResult = {
  flagged: number;
  byKind: Record<string, number>;
};

/** Subscriptions unused for >60 days → unused_sub flag. */
async function unusedSubscriptionDetector(householdId: string): Promise<number> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId));

  let flagged = 0;
  const cutoff = new Date(Date.now() - 60 * 86400 * 1000).toISOString().slice(0, 10);

  for (const sub of rows) {
    if (sub.status !== "active") continue;
    const lastUsed = sub.lastUsedAt;
    if (!lastUsed) continue;
    if (lastUsed > cutoff) continue; // used recently

    // Find the household owner so we can attribute the protection to them.
    const owner = await db
      .select({ id: members.userId })
      .from(members)
      .where(and(eq(members.coupleId, householdId), eq(members.role, "owner")))
      .limit(1);
    const ownerId = owner[0]?.id;
    if (!ownerId) continue;

    // Skip if a recent unused_sub protection already exists for this sub.
    const existing = await db
      .select({ id: protections.id })
      .from(protections)
      .where(
        and(
          eq(protections.subscriptionId, sub.id),
          eq(protections.kind, "unused_sub"),
          eq(protections.status, "flagged"),
        ),
      )
      .limit(1);
    if (existing.length) continue;

    await db.insert(protections).values({
      userId: ownerId,
      householdId,
      kind: "unused_sub",
      severity: "decision_needed",
      summary: `${sub.merchant} unused 60+ days · $${sub.amount.toFixed(2)} ${sub.cadence}`,
      detail: `You haven't touched ${sub.merchant} since ${lastUsed}. It's still charging $${sub.amount.toFixed(2)} ${sub.cadence}.`,
      ctaLabel: `Pause $${sub.amount.toFixed(2)}`,
      ctaAction: "pause_subscription",
      ctaTargetId: sub.id,
      subscriptionId: sub.id,
      status: "flagged",
    });
    flagged++;
  }
  return flagged;
}

/** Small intro charges followed by a larger upcoming real charge. */
async function freeTrialDetector(householdId: string): Promise<number> {
  // Heuristic: look for transactions ≤ $1 in the past 14 days where the
  // merchant also has an active subscription with amount > $5.
  const introCutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString().slice(0, 10);

  const introRows = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        sql`${plaidTransactions.amount} > 0 AND ${plaidTransactions.amount} <= 1`,
        sql`${plaidTransactions.date} >= ${introCutoff}`,
      ),
    );

  let flagged = 0;
  const owner = await db
    .select({ id: members.userId })
    .from(members)
    .where(and(eq(members.coupleId, householdId), eq(members.role, "owner")))
    .limit(1);
  const ownerId = owner[0]?.id;
  if (!ownerId) return 0;

  for (const tx of introRows) {
    const merchant = tx.merchantName;
    if (!merchant) continue;

    // Match against any subscription with a meaningful amount.
    const sub = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.householdId, householdId),
          eq(subscriptions.merchant, merchant),
          sql`${subscriptions.amount} > 5`,
        ),
      )
      .limit(1);
    if (!sub.length) continue;

    const existing = await db
      .select({ id: protections.id })
      .from(protections)
      .where(
        and(
          eq(protections.subscriptionId, sub[0].id),
          eq(protections.kind, "free_trial"),
          eq(protections.status, "flagged"),
        ),
      )
      .limit(1);
    if (existing.length) continue;

    await db.insert(protections).values({
      userId: ownerId,
      householdId,
      kind: "free_trial",
      severity: "act_today",
      summary: `${merchant} free trial converts soon · $${sub[0].amount.toFixed(2)} ${sub[0].cadence}`,
      detail: `You started ${merchant} with a small charge on ${tx.date}. The full $${sub[0].amount.toFixed(2)} ${sub[0].cadence} kicks in on ${sub[0].nextChargeAt ?? "the next billing date"}.`,
      ctaLabel: `Cancel before it converts`,
      ctaAction: "pause_subscription",
      ctaTargetId: sub[0].id,
      subscriptionId: sub[0].id,
      status: "flagged",
    });
    flagged++;
  }
  return flagged;
}

export async function runProtectionScan(householdId: string): Promise<DetectorResult> {
  const byKind: Record<string, number> = {};

  const unused = await unusedSubscriptionDetector(householdId).catch((err) => {
    console.error("unusedSubscriptionDetector failed:", err);
    return 0;
  });
  byKind.unused_sub = unused;

  const trials = await freeTrialDetector(householdId).catch((err) => {
    console.error("freeTrialDetector failed:", err);
    return 0;
  });
  byKind.free_trial = trials;

  return {
    flagged: unused + trials,
    byKind,
  };
}
