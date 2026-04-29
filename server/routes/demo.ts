/**
 * Demo seeder — populates the user's account with 6 weeks of realistic
 * patterned transactions so Tilly's pattern detection lights up
 * immediately. Useful for:
 *
 *   - Beta users who can't or don't want to connect a real bank yet.
 *   - Plaid sandbox testing where Plaid's seed data is generic and
 *     doesn't include the soft-spot patterns Tilly was designed around.
 *   - Demos / screenshots where you want a populated app in 5 seconds.
 *
 *   POST /api/demo/seed     — inserts ~6 weeks of expenses for the user
 *   POST /api/demo/clear    — removes all demo-sourced rows
 *
 * Patterns intentionally seeded:
 *   - Wednesday-afternoon coffee + DoorDash spike (the spec's signature
 *     "soft spot" — gives Tilly Learned something to surface).
 *   - Friday paycheck-day groceries + Saturday brunch.
 *   - One CitiBike-style monthly subscription so the unused-sub
 *     protection rule has a candidate.
 *   - One looming free-trial converging in 3 days.
 *   - One unusually-large purchase today (concert ticket).
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { expenses, plaidItems, plaidTransactions, subscriptions } from "../../shared/schema";
import { runProtectionsForHousehold } from "../tilly/protections-engine";
import { getPlaidClient, isPlaidConfigured, mapPlaidCategory, shouldImportPlaidTransaction } from "../plaid";

type SeedExpense = {
  daysAgo: number;
  amount: number;
  description: string;
  merchant: string;
  category: string;
};

// Wider variance per cell so the soft-spot detector (1.5σ test) can
// actually fire. Real student spend has way more jitter than the
// previous tight clusters.
const COFFEE_AMOUNTS = [4.5, 5.25, 4.75, 5.5, 5.0, 6.25];
const FOOD_NIGHT_AMOUNTS = [12, 18, 22, 28, 19, 38, 24, 16];
const GROC_AMOUNTS = [22, 38, 42, 35, 67, 28, 47];

function jitter(base: number, pct = 0.12): number {
  // ±pct random walk so historical samples have non-zero std-dev.
  const delta = base * pct * (Math.random() * 2 - 1);
  return Math.round((base + delta) * 100) / 100;
}

function buildSixWeeks(): SeedExpense[] {
  const out: SeedExpense[] = [];
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon..6=Sun

  for (let weekIdx = 0; weekIdx < 6; weekIdx++) {
    // Anchor each week to its Monday relative to today.
    const weekMondayOffset = todayDow + weekIdx * 7;

    // Mon: subway commute (small, consistent)
    out.push({
      daysAgo: weekMondayOffset,
      amount: jitter(2.9, 0.05),
      merchant: "MTA",
      description: "subway",
      category: "transit",
    });

    // Tue: light spend
    out.push({
      daysAgo: weekMondayOffset - 1,
      amount: jitter(8.5),
      merchant: "Subway",
      description: "lunch",
      category: "eatout",
    });

    // Wed: THE PATTERN — coffee + late food. The Wed late-food amount
    // is intentionally larger this week (the spike that fires the soft
    // spot detector) — historical Wednesdays cluster low, this Wed
    // doubles up.
    const isThisWeekWed = weekIdx === 0;
    out.push({
      daysAgo: weekMondayOffset - 2,
      amount: jitter(COFFEE_AMOUNTS[weekIdx % COFFEE_AMOUNTS.length]),
      merchant: "Stumptown",
      description: "Wednesday coffee",
      category: "coffee",
    });
    out.push({
      daysAgo: weekMondayOffset - 2,
      amount: isThisWeekWed
        ? 41 // this week's spike — 2× the historical mean
        : jitter(FOOD_NIGHT_AMOUNTS[weekIdx % FOOD_NIGHT_AMOUNTS.length], 0.18),
      merchant: "DoorDash · Halal Guys",
      description: "late night DoorDash",
      category: "eatout",
    });

    // Thu: small
    out.push({
      daysAgo: weekMondayOffset - 3,
      amount: jitter(6.25),
      merchant: "Joe Coffee",
      description: "morning coffee",
      category: "coffee",
    });

    // Fri: paycheck-day groceries
    out.push({
      daysAgo: weekMondayOffset - 4,
      amount: jitter(GROC_AMOUNTS[weekIdx % GROC_AMOUNTS.length], 0.20),
      merchant: "Trader Joe's",
      description: "groceries",
      category: "groceries",
    });

    // Sat: brunch out
    out.push({
      daysAgo: weekMondayOffset - 5,
      amount: jitter(28, 0.15),
      merchant: "Bluestone Lane",
      description: "brunch",
      category: "eatout",
    });
  }

  // Today: the unusually-large concert ticket — fires the unusual_charge protection.
  out.push({
    daysAgo: 0,
    amount: 90,
    merchant: "Ticketmaster",
    description: "concert ticket",
    category: "entertainment",
  });

  return out;
}

export function mountDemoRoutes(app: Express): void {
  app.post("/api/demo/seed", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no_household" });

    // Clear any prior demo rows so re-seed is idempotent.
    await db
      .delete(expenses)
      .where(and(eq(expenses.coupleId, householdId), eq(expenses.source, "demo_seed")));
    await db
      .delete(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.source, "demo_seed")));

    // Insert expenses
    const seed = buildSixWeeks();
    const today = new Date();
    const rows = seed.map((s) => {
      const d = new Date(today);
      d.setDate(today.getDate() - s.daysAgo);
      return {
        coupleId: householdId,
        userId: req.user!.id,
        source: "demo_seed",
        rawInput: null,
        amount: s.amount,
        description: s.description,
        merchant: s.merchant,
        category: s.category,
        date: d.toISOString().slice(0, 10),
        paidBy: req.user!.id,
        isRecurring: false,
      };
    });
    await db.insert(expenses).values(rows);

    // Insert two subscriptions: one unused (60+ days no use) + one
    // free-trial converging in 3 days.
    const sixtyOneDaysAgo = new Date(today);
    sixtyOneDaysAgo.setDate(today.getDate() - 61);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    await db.insert(subscriptions).values([
      {
        householdId,
        merchant: "CitiBike",
        amount: 19.95,
        cadence: "monthly",
        status: "active",
        source: "demo_seed",
        lastUsedAt: sixtyOneDaysAgo.toISOString().slice(0, 10),
        nextChargeAt: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        lastChargedAt: new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        usageNote: "Used twice in 30 days",
      },
      {
        householdId,
        merchant: "Apple TV+",
        amount: 9.99,
        cadence: "monthly",
        status: "active",
        source: "demo_seed",
        lastUsedAt: null,
        nextChargeAt: threeDaysFromNow.toISOString().slice(0, 10),
        lastChargedAt: null, // first charge → free-trial converging
        usageNote: "Free trial",
      },
    ]);

    // Run the protections engine immediately so the demo includes
    // flagged rows.
    try {
      await runProtectionsForHousehold(householdId);
    } catch (err) {
      console.warn("[demo/seed] protections sweep failed:", err);
    }

    res.json({
      ok: true,
      expensesSeeded: rows.length,
      subscriptionsSeeded: 2,
    });
  });

  /**
   * Sandbox Plaid connect — bypasses the Link UI entirely. Calls Plaid's
   * /sandbox/public_token/create with a known institution + transactions
   * product, exchanges for an access_token, persists a plaid_items row,
   * then runs the initial /transactions/sync. After this, the user's
   * Today/Spend/Credit screens flip to the real Plaid path because
   * `plaidConnected` becomes true.
   *
   * Idempotent: re-running replaces the prior demo plaid_item.
   */
  app.post(
    "/api/demo/connect-plaid-sandbox",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });

      if (!isPlaidConfigured()) {
        return res
          .status(503)
          .json({ error: "plaid_not_configured", detail: "Set PLAID_CLIENT_ID + PLAID_SECRET" });
      }
      const plaid = getPlaidClient();
      if (!plaid) return res.status(503).json({ error: "plaid_client_unavailable" });

      try {
        // 1. Sandbox public_token create — Wells Fargo (ins_127991) + transactions.
        // Plaid's sandbox seed includes ~3 months of synthetic transactions for
        // this institution, which is exactly what we need.
        const create: any = await (plaid as any).sandboxPublicTokenCreate({
          institution_id: "ins_127991",
          initial_products: ["transactions"],
          options: {
            override_username: "user_good",
            override_password: "pass_good",
          },
        });
        const publicToken = create.data.public_token;

        // 2. Exchange for access_token.
        const exchange: any = await (plaid as any).itemPublicTokenExchange({
          public_token: publicToken,
        });
        const accessToken = exchange.data.access_token;
        const itemId = exchange.data.item_id;

        // 3. Replace any prior demo plaid_item.
        await db
          .delete(plaidItems)
          .where(and(eq(plaidItems.coupleId, householdId), eq(plaidItems.institutionName, "Wells Fargo (sandbox)")));
        const [item] = await db
          .insert(plaidItems)
          .values({
            coupleId: householdId,
            userId: req.user.id,
            plaidItemId: itemId,
            accessToken,
            institutionId: "ins_127991",
            institutionName: "Wells Fargo (sandbox)",
            status: "active",
          })
          .returning();

        // 4. Initial sync. Plaid sandbox sometimes needs a moment after
        // public_token_create before transactions are queryable; we retry.
        let added = 0;
        let cursor: string | undefined = undefined;
        let hasMore = true;
        let attempts = 0;
        while (hasMore && attempts < 6) {
          attempts++;
          try {
            const resp: any = await (plaid as any).transactionsSync({
              access_token: accessToken,
              cursor,
            });
            const data = resp.data;
            for (const tx of data.added || []) {
              if (!shouldImportPlaidTransaction(tx)) continue;
              try {
                await db.insert(plaidTransactions).values({
                  coupleId: householdId,
                  plaidItemId: item.id,
                  plaidTransactionId: tx.transaction_id,
                  accountId: tx.account_id,
                  amount: tx.amount,
                  date: tx.date,
                  merchantName: tx.merchant_name ?? null,
                  name: tx.name ?? "Unknown",
                  plaidCategory: tx.category ?? null,
                  ourCategory: mapPlaidCategory(tx.category, tx.personal_finance_category),
                  pending: tx.pending ?? false,
                  status: "pending_review",
                });
                added++;
              } catch (e: any) {
                if (!String(e.message ?? "").includes("duplicate")) {
                  console.warn("plaid tx insert:", e.message);
                }
              }
            }
            cursor = data.next_cursor;
            hasMore = data.has_more;
          } catch (err: any) {
            const code = err?.response?.data?.error_code;
            if (code === "PRODUCT_NOT_READY") {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            throw err;
          }
        }
        await db
          .update(plaidItems)
          .set({ cursor: cursor ?? null, lastSyncAt: new Date() })
          .where(eq(plaidItems.id, item.id));

        // 5. Refresh protections (free trials, unused subs, etc).
        try {
          await runProtectionsForHousehold(householdId);
        } catch {}

        res.json({
          ok: true,
          itemId: item.id,
          institution: "Wells Fargo (sandbox)",
          transactionsAdded: added,
        });
      } catch (err: any) {
        console.error("plaid sandbox connect:", err?.response?.data ?? err);
        res.status(500).json({
          error: "sandbox_connect_failed",
          detail: err?.response?.data?.error_message ?? err?.message ?? String(err),
        });
      }
    },
  );

  app.post("/api/demo/clear", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no_household" });
    const expR = await db
      .delete(expenses)
      .where(and(eq(expenses.coupleId, householdId), eq(expenses.source, "demo_seed")));
    const subR = await db
      .delete(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.source, "demo_seed")));
    res.json({ ok: true });
  });
}
