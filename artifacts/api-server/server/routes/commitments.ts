/**
 * Commitment routes — the payday allocation choice and the standing
 * commitments it creates (docs/PRD_COMMITMENT_LAYER.md, F1/F2).
 *
 * The allocation surface lives INSIDE Home, not on a new screen: the
 * payday pulse already pushes on paycheque detection and the week strip
 * already renders a payday card. This endpoint gives that existing
 * moment its choice.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { goals, subscriptions } from "../../shared/schema";
import {
  createSweepCommitment,
  listActiveCommitments,
  updateCommitment,
} from "../tilly/commitments";
import { buildIncomeReview } from "../tilly/income-review";
import {
  dedupeIncomeRows,
  inferCadence,
  readIncomeRows,
  splitAnomalousIncome,
} from "../tilly/income-summary";
import {
  addDaysIso,
  cadenceStepDays,
  computePaydayAllocation,
  type CycleBill,
} from "../tilly/payday-brief";
import { getUserTimezone, localDateString, localDaysAgoIso } from "../tilly/user-tz";

/** How far back a paycheque still counts as "this cycle" for the card. */
const ALLOCATION_WINDOW_DAYS = 16;

export function mountCommitmentRoutes(app: Express): void {
  // GET /api/tilly/payday-allocation — the live choice for the current
  // pay cycle, or { active: false } when no paycheque landed recently.
  app.get("/api/tilly/payday-allocation", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const userId = req.user.id;
    try {
      const now = new Date();
      const tz = await getUserTimezone(userId);
      const todayIso = localDateString(now, tz);

      const rows = await readIncomeRows(householdId, localDaysAgoIso(now, tz, 90));
      const { typical } = splitAnomalousIncome(dedupeIncomeRows(rows));
      const maxTypical = Math.max(...typical.map((r) => Math.abs(r.amount)), 0);
      const windowStart = addDaysIso(todayIso, -ALLOCATION_WINDOW_DAYS);
      const landed = typical
        .filter((r) => r.date >= windowStart && r.date <= todayIso && Math.abs(r.amount) >= maxTypical * 0.25)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!landed) return res.json({ active: false, reason: "no_recent_paycheck" });

      // Same denominator gate as every other surplus surface: while
      // income is unverified there is no allocation to offer, because
      // "truly free" isn't a number we can stand behind. Degrades closed.
      let incomeBlocked = true;
      try {
        incomeBlocked = (await buildIncomeReview(userId, householdId, now)).confidence.blocksSurplusClaims;
      } catch (err) {
        console.warn("/api/tilly/payday-allocation income review failed:", err);
      }

      const cadence = inferCadence(typical.map((r) => r.date));
      const step = cadenceStepDays(cadence);
      const cycleEndIso = addDaysIso(landed.date, step ?? 14);
      const subs = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")));
      const billsDue: CycleBill[] = subs
        .filter((s) => {
          const next = s.nextChargeAt?.slice(0, 10) ?? null;
          return next && next > landed.date && next <= cycleEndIso;
        })
        .map((s) => ({ merchant: s.merchant, amount: s.amount, date: s.nextChargeAt!.slice(0, 10) }))
        .sort((a, b) => b.amount - a.amount);

      const { trailingVariablePace } = await import("../tilly/payday-brief");
      const dailyPace = await trailingVariablePace(userId, householdId, now, tz);

      const [goalRows, active] = await Promise.all([
        db.select().from(goals).where(eq(goals.coupleId, householdId)).orderBy(desc(goals.createdAt)).limit(20),
        listActiveCommitments(householdId),
      ]);
      const sweeps = active.filter((c) => c.kind === "sweep");
      const allocation = computePaydayAllocation({
        paycheckAmount: Math.abs(landed.amount),
        paydayDate: landed.date,
        cadence,
        billsDue,
        dailyPace,
        dream: goalRows[0]
          ? { id: goalRows[0].id, name: goalRows[0].name, targetAmount: goalRows[0].targetAmount, savedAmount: goalRows[0].savedAmount }
          : null,
        goals: goalRows.map((g) => ({
          id: g.id,
          name: g.name,
          targetAmount: g.targetAmount,
          savedAmount: g.savedAmount,
          currentPerPayday: sweeps.find((c) => c.targetGoalId === g.id && c.status === "active")?.amount ?? 0,
        })),
      });

      res.json({
        active: true,
        paydayDate: landed.date,
        cycleEndIso,
        incomeBlocked,
        allocation: incomeBlocked ? { ...allocation, options: [], dreamSuggestion: null } : allocation,
        commitments: sweeps.map(wireCommitment),
      });
    } catch (err) {
      console.error("/api/tilly/payday-allocation error:", err);
      res.status(500).json({ error: "allocation failed" });
    }
  });

  app.get("/api/tilly/commitments", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    try {
      res.json({ commitments: (await listActiveCommitments(householdId)).map(wireCommitment) });
    } catch (err) {
      console.error("/api/tilly/commitments GET error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  // POST /api/tilly/commitments — the consent. Records which framing
  // produced it (consentFrame): that is the DV for the framing test.
  app.post("/api/tilly/commitments", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const { goalId, amount, consentFrame } = (req.body ?? {}) as {
      goalId?: string;
      amount?: number;
      consentFrame?: string;
    };
    if (typeof goalId !== "string" || !goalId) return res.status(400).json({ error: "goalId required" });
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 25) {
      return res.status(400).json({ error: "amount must be at least $25 per payday" });
    }
    try {
      const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.coupleId, householdId))).limit(1);
      if (!g) return res.status(404).json({ error: "goal not found" });
      const row = await createSweepCommitment({
        householdId,
        userId: req.user.id,
        goalId,
        amount: Math.round(amount),
        consentFrame: typeof consentFrame === "string" ? consentFrame.slice(0, 40) : null,
      });
      res.json({ commitment: wireCommitment(row) });
    } catch (err) {
      console.error("/api/tilly/commitments POST error:", err);
      res.status(500).json({ error: "create failed" });
    }
  });

  // PATCH — reduce is one tap, pause is one tap, end is deliberate.
  app.patch("/api/tilly/commitments/:id", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const { status, amount } = (req.body ?? {}) as { status?: string; amount?: number };
    const patch: Parameters<typeof updateCommitment>[2] = {};
    if (status !== undefined) {
      if (status !== "active" && status !== "paused" && status !== "ended") {
        return res.status(400).json({ error: "status must be active | paused | ended" });
      }
      patch.status = status;
    }
    if (amount !== undefined) {
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 25) {
        return res.status(400).json({ error: "amount must be at least $25 per payday" });
      }
      patch.amount = Math.round(amount);
    }
    try {
      const row = await updateCommitment(householdId, String(req.params.id), patch);
      if (!row) return res.status(404).json({ error: "commitment not found" });
      res.json({ commitment: wireCommitment(row) });
    } catch (err) {
      console.error("/api/tilly/commitments PATCH error:", err);
      res.status(500).json({ error: "update failed" });
    }
  });
}

function wireCommitment(c: {
  id: string;
  kind: string;
  targetGoalId: string | null;
  amount: number;
  cadence: string;
  status: string;
  consentedAt: Date;
}) {
  return {
    id: c.id,
    kind: c.kind,
    goalId: c.targetGoalId,
    amount: c.amount,
    cadence: c.cadence,
    status: c.status,
    consentedAt: c.consentedAt.toISOString(),
  };
}
