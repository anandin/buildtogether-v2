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
import { expenses, subscriptions } from "../../shared/schema";

type SeedExpense = {
  daysAgo: number;
  amount: number;
  description: string;
  merchant: string;
  category: string;
};

const COFFEE_AMOUNTS = [4.5, 5.25, 4.75, 5.5, 5.0];
const FOOD_NIGHT_AMOUNTS = [18, 22, 19, 24, 21];
const GROC_AMOUNTS = [38, 42, 35, 47];

function buildSixWeeks(): SeedExpense[] {
  const out: SeedExpense[] = [];
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7; // 0=Mon..6=Sun

  for (let weekIdx = 0; weekIdx < 6; weekIdx++) {
    // Anchor each week to its Monday relative to today.
    const weekMondayOffset = todayDow + weekIdx * 7;

    // Mon: subway commute
    out.push({
      daysAgo: weekMondayOffset,
      amount: 2.9,
      merchant: "MTA",
      description: "subway",
      category: "transit",
    });

    // Tue: light spend
    out.push({
      daysAgo: weekMondayOffset - 1,
      amount: 8.5,
      merchant: "Subway",
      description: "lunch",
      category: "eatout",
    });

    // Wed: THE PATTERN — coffee + late food
    out.push({
      daysAgo: weekMondayOffset - 2,
      amount: COFFEE_AMOUNTS[weekIdx % COFFEE_AMOUNTS.length],
      merchant: "Stumptown",
      description: "Wednesday coffee",
      category: "coffee",
    });
    out.push({
      daysAgo: weekMondayOffset - 2,
      amount: FOOD_NIGHT_AMOUNTS[weekIdx % FOOD_NIGHT_AMOUNTS.length],
      merchant: "DoorDash · Halal Guys",
      description: "late night DoorDash",
      category: "eatout",
    });

    // Thu: small
    out.push({
      daysAgo: weekMondayOffset - 3,
      amount: 6.25,
      merchant: "Joe Coffee",
      description: "morning coffee",
      category: "coffee",
    });

    // Fri: paycheck-day groceries
    out.push({
      daysAgo: weekMondayOffset - 4,
      amount: GROC_AMOUNTS[weekIdx % GROC_AMOUNTS.length],
      merchant: "Trader Joe's",
      description: "groceries",
      category: "groceries",
    });

    // Sat: brunch out
    out.push({
      daysAgo: weekMondayOffset - 5,
      amount: 28,
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
      const { runProtectionsForHousehold } = await import(
        "../tilly/protections-engine"
      );
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
