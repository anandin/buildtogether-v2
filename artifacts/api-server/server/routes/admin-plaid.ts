/**
 * Admin Plaid API — feeds the /admin Plaid tab.
 *
 *   GET /api/admin/plaid/items
 *     → all plaid_items grouped by user (institution, status, lastSyncAt,
 *       lastError, txn count)
 *   GET /api/admin/plaid/users/:id/transactions?limit=50
 *     → recent plaid_transactions for the given user's couple
 */
import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import {
  plaidItems,
  plaidTransactions,
  users,
} from "../../shared/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

export function mountAdminPlaidRoutes(app: Express): void {
  app.get(
    "/api/admin/plaid/items",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        // Per-item txn count subquery (cheap for our volume).
        const txnCounts = db
          .select({
            plaidItemId: plaidTransactions.plaidItemId,
            n: sql<number>`count(*)`.as("n"),
          })
          .from(plaidTransactions)
          .groupBy(plaidTransactions.plaidItemId)
          .as("txnCounts");

        const rows = await db
          .select({
            id: plaidItems.id,
            userId: plaidItems.userId,
            email: users.email,
            name: users.name,
            coupleId: plaidItems.coupleId,
            institutionId: plaidItems.institutionId,
            institutionName: plaidItems.institutionName,
            status: plaidItems.status,
            lastSyncAt: plaidItems.lastSyncAt,
            lastError: plaidItems.lastError,
            createdAt: plaidItems.createdAt,
            txnCount: txnCounts.n,
          })
          .from(plaidItems)
          .leftJoin(users, eq(users.id, plaidItems.userId))
          .leftJoin(txnCounts, eq(txnCounts.plaidItemId, plaidItems.id))
          .orderBy(desc(plaidItems.createdAt))
          .limit(500);

        res.json({ items: rows });
      } catch (err) {
        console.error("/api/admin/plaid/items failed:", err);
        res.status(500).json({ error: "items_failed" });
      }
    },
  );

  app.get(
    "/api/admin/plaid/users/:id/transactions",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const userId = String(req.params.id);
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
        const u = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { id: true, coupleId: true, email: true, name: true },
        });
        if (!u) return res.status(404).json({ error: "user_not_found" });
        if (!u.coupleId) {
          return res.json({ user: u, transactions: [] });
        }
        const txns = await db
          .select()
          .from(plaidTransactions)
          .where(eq(plaidTransactions.coupleId, u.coupleId))
          .orderBy(desc(plaidTransactions.date))
          .limit(limit);
        res.json({ user: u, transactions: txns });
      } catch (err) {
        console.error("/api/admin/plaid/users/:id/transactions failed:", err);
        res.status(500).json({ error: "txns_failed" });
      }
    },
  );
}
