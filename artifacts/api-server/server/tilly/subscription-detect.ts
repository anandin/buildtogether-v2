/**
 * Subscription detection — v3.
 *
 * Two paths, both real:
 *   1. Plaid `transactionsRecurringGet` when the institution supports it.
 *   2. History inference over stored `plaid_transactions` (see
 *      recurring-infer.ts). This runs even when Plaid credentials are
 *      absent, so sandbox imports and manual-accept history still
 *      produce a subscription list.
 *
 * Upserts by (household, normalized merchant). Plaid stream ids are
 * stored when path 1 produced the row.
 */
import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import { plaidItems, plaidTransactions, subscriptions } from "../../shared/schema";
import { decryptSecret } from "../security/crypto-fields";
import { getPlaidClient, isPlaidConfigured } from "../plaid";
import { inferRecurring, normalizeMerchant, type InferredRecurring } from "./recurring-infer";

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function upsertStream(
  householdId: string,
  stream: {
    merchant: string;
    amount: number;
    cadence: string;
    cadenceDays: number | null;
    lastChargedAt: string | null;
    nextChargeAt: string | null;
    source: string;
    plaidRecurringStreamId?: string | null;
    usageNote?: string | null;
  },
): Promise<"inserted" | "updated"> {
  const key = normalizeMerchant(stream.merchant);
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId));
  const match = existing.find(
    (row) =>
      (stream.plaidRecurringStreamId &&
        row.plaidRecurringStreamId === stream.plaidRecurringStreamId) ||
      normalizeMerchant(row.merchant) === key,
  );
  if (match) {
    if (match.status === "paused" || match.status === "cancelled") {
      return "updated";
    }
    await db
      .update(subscriptions)
      .set({
        amount: stream.amount,
        cadence: stream.cadence,
        cadenceDays: stream.cadenceDays,
        lastChargedAt: stream.lastChargedAt ?? match.lastChargedAt,
        nextChargeAt: stream.nextChargeAt ?? match.nextChargeAt,
        usageNote: stream.usageNote ?? match.usageNote,
        source: match.source === "manual" ? match.source : stream.source,
        plaidRecurringStreamId: stream.plaidRecurringStreamId ?? match.plaidRecurringStreamId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, match.id));
    return "updated";
  }
  await db.insert(subscriptions).values({
    householdId,
    merchant: stream.merchant,
    amount: stream.amount,
    cadence: stream.cadence,
    cadenceDays: stream.cadenceDays,
    lastChargedAt: stream.lastChargedAt,
    nextChargeAt: stream.nextChargeAt,
    status: "active",
    source: stream.source,
    plaidRecurringStreamId: stream.plaidRecurringStreamId ?? null,
    usageNote: stream.usageNote ?? null,
  });
  return "inserted";
}

async function scanFromHistory(householdId: string, result: ScanResult): Promise<void> {
  const since = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      merchant: plaidTransactions.merchantName,
      name: plaidTransactions.name,
      amount: plaidTransactions.amount,
      date: plaidTransactions.date,
      category: plaidTransactions.ourCategory,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        inArray(plaidTransactions.status, ["accepted", "pending_review"]),
        sql`${plaidTransactions.date} >= ${since}`,
        sql`${plaidTransactions.amount} > 0`,
      ),
    );

  const inferred: InferredRecurring[] = inferRecurring(
    rows.map((r) => ({
      merchant: (r.merchant || r.name || "").trim(),
      amount: r.amount,
      date: r.date,
      category: r.category,
    })),
    todayIso(),
  );

  for (const stream of inferred) {
    const outcome = await upsertStream(householdId, {
      merchant: stream.merchant,
      amount: stream.amount,
      cadence: stream.cadence,
      cadenceDays: stream.cadenceDays,
      lastChargedAt: stream.lastChargedAt,
      nextChargeAt: stream.nextChargeAt,
      source: "rule_based",
      usageNote: `Seen ${stream.occurrences}× · cadence ${stream.cadence}`,
    });
    if (outcome === "inserted") {
      result.fromRules += 1;
      result.detected += 1;
    }
  }
}

/**
 * Run the recurring scan for a household. History inference always runs.
 * The live Plaid recurring endpoint runs only when credentials exist and
 * `includePlaidApi` is true (user-triggered scan). Cron uses history only
 * so a slow institution can't blow the function budget.
 */
export async function scanSubscriptions(
  householdId: string,
  opts?: { includePlaidApi?: boolean },
): Promise<ScanResult> {
  const result: ScanResult = {
    detected: 0,
    fromPlaidRecurring: 0,
    fromRules: 0,
    paused: 0,
    errors: [],
  };

  const includePlaidApi = opts?.includePlaidApi !== false && isPlaidConfigured();
  if (opts?.includePlaidApi !== false && !isPlaidConfigured()) {
    result.errors.push("plaid_not_configured");
  }

  if (includePlaidApi && opts?.includePlaidApi !== false) {
    const plaid = getPlaidClient();
    if (!plaid) {
      result.errors.push("plaid_client_unavailable");
    } else {
      const items = await db
        .select()
        .from(plaidItems)
        .where(eq(plaidItems.coupleId, householdId));
      for (const item of items) {
        try {
          const resp = await plaid.transactionsRecurringGet({
            access_token: decryptSecret(item.accessToken),
          });
          const outflows = resp.data.outflow_streams ?? [];
          for (const stream of outflows) {
            if (stream.is_active === false) continue;
            const cadence = toCadence(stream.frequency);
            const merchant = stream.merchant_name || stream.description || "Unknown";
            const amount = Math.abs(stream.average_amount?.amount ?? 0);
            if (amount <= 0) continue;
            const outcome = await upsertStream(householdId, {
              merchant,
              amount,
              cadence: cadence.cadence,
              cadenceDays: cadence.cadenceDays,
              lastChargedAt: stream.last_date ?? null,
              nextChargeAt: stream.predicted_next_date ?? null,
              source: "plaid_recurring",
              plaidRecurringStreamId: stream.stream_id,
            });
            if (outcome === "inserted") {
              result.fromPlaidRecurring += 1;
              result.detected += 1;
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "unknown";
          result.errors.push(`plaid_item_${item.id}: ${message}`);
        }
      }
    }
  }

  try {
    await scanFromHistory(householdId, result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown";
    result.errors.push(`rule_based: ${message}`);
  }

  return result;
}
