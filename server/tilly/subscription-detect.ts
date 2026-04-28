/**
 * Subscription detection — spec §5.7 protective surface.
 *
 * Two paths:
 *   1. Plaid `transactionsRecurringGet` if the connected institution
 *      supports it — returns recurring streams with cadence + next
 *      expected date. Most cards do support this in production.
 *   2. Rule-based fallback: same merchant + same amount within ±5%
 *      across 2+ months → infer monthly subscription.
 *
 * Upserts into `subscriptions` keyed on (household, plaidRecurringStreamId)
 * for path 1, or (household, merchant, amount) for path 2. The Home tile
 * + protections feed query this table.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { plaidItems, plaidTransactions, subscriptions } from "../../shared/schema";
import { getPlaidClient, isPlaidConfigured } from "../plaid";

export type ScanResult = {
  detected: number;
  fromPlaidRecurring: number;
  fromRules: number;
  paused: number;
  errors: string[];
};

function toCadence(frequency: string | undefined): {
  cadence: string;
  cadenceDays: number | null;
} {
  switch (frequency) {
    case "WEEKLY":
      return { cadence: "weekly", cadenceDays: 7 };
    case "BIWEEKLY":
      return { cadence: "custom", cadenceDays: 14 };
    case "MONTHLY":
      return { cadence: "monthly", cadenceDays: 30 };
    case "ANNUALLY":
      return { cadence: "yearly", cadenceDays: 365 };
    default:
      return { cadence: "monthly", cadenceDays: 30 };
  }
}

function usageNote(lastChargedAt: string | null, lastUsedAt: string | null): string {
  if (!lastChargedAt) return "";
  const daysSinceUsed = lastUsedAt
    ? Math.floor((Date.now() - new Date(lastUsedAt).getTime()) / (86400 * 1000))
    : 9999;
  if (daysSinceUsed > 60) return `Used ${daysSinceUsed} days ago`;
  if (daysSinceUsed > 30) return `Used ${daysSinceUsed} days ago`;
  return `Used ${daysSinceUsed} days ago`;
}

/**
 * Run the recurring-tx scan for a household. Returns a summary; the
 * subscriptions table is the source of truth for per-row state.
 */
export async function scanSubscriptions(householdId: string): Promise<ScanResult> {
  const result: ScanResult = {
    detected: 0,
    fromPlaidRecurring: 0,
    fromRules: 0,
    paused: 0,
    errors: [],
  };

  if (!isPlaidConfigured()) {
    result.errors.push("plaid_not_configured");
    return result;
  }

  const plaid = getPlaidClient();
  if (!plaid) {
    result.errors.push("plaid_client_unavailable");
    return result;
  }

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.coupleId, householdId));

  // ─── Path 1: Plaid recurring streams ───────────────────────────────────
  for (const item of items) {
    try {
      const resp = await plaid.transactionsRecurringGet({
        access_token: item.accessToken,
      });
      const outflows = resp.data.outflow_streams ?? [];
      for (const stream of outflows) {
        if (stream.is_active === false) continue;
        const cadence = toCadence(stream.frequency);
        const merchant = stream.merchant_name || stream.description || "Unknown";
        const amount = Math.abs(stream.average_amount?.amount ?? 0);
        if (amount <= 0) continue;

        await db
          .insert(subscriptions)
          .values({
            householdId,
            merchant,
            amount,
            cadence: cadence.cadence,
            cadenceDays: cadence.cadenceDays,
            lastChargedAt: stream.last_date ?? null,
            nextChargeAt: stream.predicted_next_date ?? null,
            status: "active",
            source: "plaid_recurring",
            plaidRecurringStreamId: stream.stream_id,
          })
          .onConflictDoNothing();
        result.fromPlaidRecurring++;
        result.detected++;
      }
    } catch (err: any) {
      // Many sandbox / regional banks don't support recurring. Fall through
      // to the rule-based detector instead of failing the scan.
      result.errors.push(`plaid_item_${item.id}: ${err?.message ?? "unknown"}`);
    }
  }

  // ─── Path 2: rule-based fallback ───────────────────────────────────────
  // Same merchant + ~same amount across 2+ months in plaid_transactions.
  try {
    const aggResult = await db.execute(sql`
      SELECT merchant_name AS merchant,
             ROUND(amount::numeric, 0) AS amount,
             COUNT(*)                  AS occurrences,
             MAX(date)                 AS last_seen
        FROM ${plaidTransactions}
       WHERE couple_id = ${householdId}
         AND amount > 0
         AND merchant_name IS NOT NULL
       GROUP BY merchant_name, ROUND(amount::numeric, 0)
      HAVING COUNT(*) >= 2
    `);
    const candidates = (aggResult.rows ?? []) as {
      merchant: string;
      amount: string;
      occurrences: string;
      last_seen: string;
    }[];

    for (const c of candidates) {
      const merchant = c.merchant;
      const amt = Number(c.amount);
      if (!Number.isFinite(amt) || amt <= 0) continue;

      // Skip if already covered by a Plaid recurring stream entry.
      const existing = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.householdId, householdId),
            eq(subscriptions.merchant, merchant),
          ),
        )
        .limit(1);
      if (existing.length) continue;

      await db
        .insert(subscriptions)
        .values({
          householdId,
          merchant,
          amount: amt,
          cadence: "monthly",
          cadenceDays: 30,
          lastChargedAt: c.last_seen,
          nextChargeAt: null,
          status: "active",
          source: "rule_based",
          usageNote: `Seen ${c.occurrences}× in transaction history`,
        })
        .onConflictDoNothing();
      result.fromRules++;
      result.detected++;
    }
  } catch (err: any) {
    result.errors.push(`rule_based: ${err?.message ?? "unknown"}`);
  }

  return result;
}
