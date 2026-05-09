/**
 * One-shot: rerun the auto-accept classifier on every row currently stuck
 * in `pending_review`, using the now-correct PFC + name-keyword filters.
 *
 * Why: rows imported before the personal_finance_category column landed
 * (or before the noisy-keyword list got tightened) sit in pending_review
 * forever — the per-request backfill in /api/plaid/pending only runs when
 * the user opens the screen, AND used to drop PFC, so transfers / CC
 * payments / bank fees never folded into the spend feed even after the
 * smart-accept logic landed.
 *
 * Run once after deploying the schema migration:
 *   pnpm --filter @workspace/api-server exec tsx scripts/reclassify-pending.ts
 *
 * Idempotent: only touches `pending_review` rows whose `pending=false`.
 * Skips ones still in pending status; those need /api/plaid/reconcile/:coupleId
 * to flip the pending flag first.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import { plaidTransactions, plaidItems, expenses, users } from "../shared/schema";
import { shouldAutoAcceptPlaidTransaction } from "../server/plaid";

async function main() {
  console.log("[reclassify-pending] starting");

  const queue = await db
    .select()
    .from(plaidTransactions)
    .where(eq(plaidTransactions.status, "pending_review"));

  console.log(`[reclassify-pending] ${queue.length} rows in pending_review`);

  if (queue.length === 0) {
    await pool?.end();
    return;
  }

  // Build item → connector role for every household represented in the
  // queue. We don't filter by coupleId here so a multi-household DB still
  // attributes each accepted expense to whichever partner connected the bank.
  const itemIds = Array.from(new Set(queue.map((q) => q.plaidItemId)));
  const itemsForQueue = itemIds.length
    ? await db.select().from(plaidItems).where(inArray(plaidItems.id, itemIds))
    : [];
  const userIds = Array.from(new Set(itemsForQueue.map((i) => i.userId)));
  const connectors = userIds.length
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const roleByItem = new Map<string, string>();
  for (const it of itemsForQueue) {
    const u = connectors.find((c) => c.id === it.userId);
    roleByItem.set(it.id, u?.partnerRole || "partner1");
  }

  let accepted = 0;
  let kept = 0;
  for (const ptx of queue) {
    if (ptx.pending) {
      kept++;
      continue;
    }

    const txShape = {
      amount: ptx.amount,
      name: ptx.name,
      merchant_name: ptx.merchantName,
      category: (ptx.plaidCategory as string[] | null) || null,
      personal_finance_category:
        (ptx.personalFinanceCategory as { primary?: string; detailed?: string } | null) || null,
    };
    if (!shouldAutoAcceptPlaidTransaction(txShape)) {
      kept++;
      continue;
    }

    const paidBy = roleByItem.get(ptx.plaidItemId) || "partner1";
    try {
      await db.transaction(async (txn) => {
        const claim = await txn
          .update(plaidTransactions)
          .set({ status: "auto_accepting" })
          .where(
            and(
              eq(plaidTransactions.id, ptx.id),
              eq(plaidTransactions.status, "pending_review"),
            ),
          )
          .returning({ id: plaidTransactions.id });
        if (claim.length === 0) return;

        const [expense] = await txn
          .insert(expenses)
          .values({
            coupleId: ptx.coupleId,
            amount: ptx.amount,
            description: ptx.merchantName || ptx.name,
            merchant: ptx.merchantName || ptx.name,
            category: ptx.ourCategory || "other",
            date: ptx.date,
            paidBy,
            splitMethod: "joint",
            source: "plaid",
          })
          .returning();
        await txn
          .update(plaidTransactions)
          .set({ status: "accepted", expenseId: expense.id })
          .where(eq(plaidTransactions.id, ptx.id));
      });
      accepted++;
    } catch (err: any) {
      console.error("[reclassify-pending] failed:", ptx.id, err.message);
    }
  }

  console.log(
    `[reclassify-pending] done. accepted=${accepted} kept=${kept} (still in pending_review)`,
  );
  await pool?.end();
}

main().catch((err) => {
  console.error("[reclassify-pending] fatal:", err);
  process.exit(1);
});
