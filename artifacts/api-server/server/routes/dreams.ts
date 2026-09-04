/**
 * Dreams — spec §4.5 goal portraits.
 *
 * BT-shaped dreams with gradient header, oversized glyph, weekly auto-save,
 * Tilly nudge copy. Uses the BT fields added to `goals` in migration 0001
 * (glyph, loc, gradient jsonb, weeklyAuto, nudge, dueLabel) on top of the
 * legacy V1 fields (name, targetAmount, savedAmount, emoji, color).
 */
import type { Express, Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { goals, goalContributions } from "../../shared/schema";
import { emitEventAsync } from "../tilly/event-emitter";
import {
  contributionSplitByGoal,
  createSweepCommitment,
  listActiveCommitments,
  updateCommitment,
} from "../tilly/commitments";

type WireDream = {
  id: string;
  name: string;
  glyph: string;
  loc: string;
  target: number;
  saved: number;
  weekly: number;
  due: string;
  gradient: [string, string];
  nudge: string;
  /** Honesty split (F3): set aside in the app's ledger vs. actually moved. */
  earmarked: number;
  moved: number;
  /** Standing per-payday sweep, if the user has consented to one. */
  commitment: { id: string; amount: number; status: string } | null;
};

const DEFAULT_GLYPH = "✺";
const DEFAULT_GRADIENT: [string, string] = ["#E94B3C", "#F59E0B"];
const DEFAULT_NUDGE = "I'll move what we agreed each week. You don't have to remember.";

function rowToWire(
  row: typeof goals.$inferSelect,
  extra: { earmarked?: number; moved?: number; commitment?: WireDream["commitment"] } = {},
): WireDream {
  const gradient = (
    Array.isArray(row.gradient) && row.gradient.length === 2
      ? (row.gradient as [string, string])
      : DEFAULT_GRADIENT
  );
  return {
    id: row.id,
    name: row.name,
    glyph: row.glyph || row.emoji || DEFAULT_GLYPH,
    loc: row.loc || "",
    target: row.targetAmount,
    saved: row.savedAmount,
    weekly: row.weeklyAuto ?? 0,
    due: row.dueLabel || row.targetDate || "Year-round",
    gradient,
    nudge: row.nudge || DEFAULT_NUDGE,
    earmarked: extra.earmarked ?? 0,
    moved: extra.moved ?? 0,
    commitment: extra.commitment ?? null,
  };
}

/** List-shape enrichment: split + commitment per goal. */
async function enrich(rows: Array<typeof goals.$inferSelect>, householdId: string): Promise<WireDream[]> {
  const [split, active] = await Promise.all([
    contributionSplitByGoal(rows.map((r) => r.id)),
    listActiveCommitments(householdId),
  ]);
  return rows.map((r) => {
    const c = active.find((x) => x.kind === "sweep" && x.targetGoalId === r.id);
    return rowToWire(r, {
      ...split.get(r.id),
      commitment: c ? { id: c.id, amount: c.amount, status: c.status } : null,
    });
  });
}

export function mountDreamsRoutes(app: Express): void {
  // List all dreams for the user's household.
  app.get("/api/dreams", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) {
      return res.json({ ready: true, dreams: [], yearSaved: 0, perDay: 0 });
    }

    try {
      const rows = await db
        .select()
        .from(goals)
        .where(eq(goals.coupleId, householdId));

      const dreams = await enrich(rows, householdId);

      // Year-saved = sum of contributions in the trailing 365 days.
      // Uses a quick aggregate so the Dreams hero number is real, not stub.
      const yearAggResult = await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0)::float AS year_saved
          FROM ${goalContributions} gc
          JOIN ${goals} g ON g.id = gc.goal_id
         WHERE g.couple_id = ${householdId}
           AND gc.date >= ${new Date(Date.now() - 365 * 86400 * 1000).toISOString().slice(0, 10)}
      `);
      const yearSaved = Number((yearAggResult.rows?.[0] as any)?.year_saved ?? 0);
      const perDay = yearSaved / 365;

      res.json({ ready: true, dreams, yearSaved, perDay });
    } catch (err) {
      console.error("/api/dreams GET error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  // Create a new dream.
  app.post("/api/dreams", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) {
      return res.status(400).json({ error: "no household — complete onboarding first" });
    }

    const { name, target, glyph, gradient, weeklyAuto, loc, dueLabel, nudge } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name required" });
    }
    if (typeof target !== "number" || target <= 0) {
      return res.status(400).json({ error: "target must be a positive number" });
    }

    try {
      const [created] = await db
        .insert(goals)
        .values({
          coupleId: householdId,
          name: name.trim(),
          targetAmount: target,
          savedAmount: 0,
          emoji: typeof glyph === "string" ? glyph : DEFAULT_GLYPH,
          color: "#D8602B",
          glyph: typeof glyph === "string" ? glyph : DEFAULT_GLYPH,
          loc: typeof loc === "string" ? loc : "",
          gradient:
            Array.isArray(gradient) && gradient.length === 2
              ? gradient
              : DEFAULT_GRADIENT,
          weeklyAuto: typeof weeklyAuto === "number" ? weeklyAuto : null,
          dueLabel: typeof dueLabel === "string" ? dueLabel : null,
          nudge: typeof nudge === "string" ? nudge : DEFAULT_NUDGE,
        })
        .returning();
      res.json({ dream: rowToWire(created) });
    } catch (err) {
      console.error("/api/dreams POST error:", err);
      res.status(500).json({ error: "create failed" });
    }
  });

  // Update a dream.
  app.put("/api/dreams/:id", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const id = String(req.params.id);

    try {
      const updates: Record<string, unknown> = {};
      const b = req.body ?? {};
      if (typeof b.name === "string") updates.name = b.name.trim();
      if (typeof b.target === "number") updates.targetAmount = b.target;
      if (typeof b.glyph === "string") updates.glyph = b.glyph;
      if (typeof b.loc === "string") updates.loc = b.loc;
      if (Array.isArray(b.gradient) && b.gradient.length === 2) updates.gradient = b.gradient;
      if (typeof b.weeklyAuto === "number" || b.weeklyAuto === null) updates.weeklyAuto = b.weeklyAuto;
      if (typeof b.dueLabel === "string") updates.dueLabel = b.dueLabel;
      if (typeof b.nudge === "string") updates.nudge = b.nudge;

      const [updated] = await db
        .update(goals)
        .set(updates)
        .where(and(eq(goals.id, id), eq(goals.coupleId, householdId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "dream not found" });
      res.json({ dream: rowToWire(updated) });
    } catch (err) {
      console.error("/api/dreams PUT error:", err);
      res.status(500).json({ error: "update failed" });
    }
  });

  // Delete a dream.
  app.delete("/api/dreams/:id", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const id = String(req.params.id);

    try {
      const result = await db
        .delete(goals)
        .where(and(eq(goals.id, id), eq(goals.coupleId, householdId)))
        .returning({ id: goals.id });
      if (!result.length) return res.status(404).json({ error: "dream not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("/api/dreams DELETE error:", err);
      res.status(500).json({ error: "delete failed" });
    }
  });

  // Manual contribution.
  app.post("/api/dreams/:id/contribute", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const id = String(req.params.id);

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be positive" });
    }

    try {
      const dream = await db.transaction(async (tx) => {
        const [g] = await tx
          .select()
          .from(goals)
          .where(and(eq(goals.id, id), eq(goals.coupleId, householdId)));
        if (!g) return null;

        // A manual contribution is the user asserting the money moved —
        // it's their statement, not the app's ledger. Auto sweeps write
        // 'earmarked' (see tilly/commitments.ts).
        await tx.insert(goalContributions).values({
          goalId: id,
          amount,
          date: new Date().toISOString().slice(0, 10),
          contributor: req.user!.id,
          kind: "moved",
        });

        const [updated] = await tx
          .update(goals)
          .set({ savedAmount: g.savedAmount + amount })
          .where(eq(goals.id, id))
          .returning();
        return updated;
      });
      if (!dream) return res.status(404).json({ error: "dream not found" });
      emitEventAsync({
        userId: req.user.id,
        householdId,
        kind: "dream_contributed",
        payload: {
          amount,
          dreamName: dream.name,
          newSaved: dream.savedAmount,
          target: dream.targetAmount,
        },
        sourceTable: "goals",
        sourceId: dream.id,
      });
      res.json({ dream: rowToWire(dream) });
    } catch (err) {
      console.error("/api/dreams/:id/contribute error:", err);
      res.status(500).json({ error: "contribute failed" });
    }
  });

  // Set or update auto-save (Phase 3b: actually executes the transfer; Phase 3a:
  // just records the intent on the row + returns).
  app.post("/api/dreams/:id/auto-save", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const id = String(req.params.id);

    const weekly = Number(req.body?.weekly);
    if (!Number.isFinite(weekly) || weekly < 0) {
      return res.status(400).json({ error: "weekly must be non-negative number" });
    }

    try {
      // Source of truth is now a per-payday commitment (PRD F2). The
      // legacy "weekly" number becomes the per-payday amount; weeklyAuto
      // is mirrored inside createSweepCommitment for older clients.
      const [g] = await db
        .select()
        .from(goals)
        .where(and(eq(goals.id, id), eq(goals.coupleId, householdId)))
        .limit(1);
      if (!g) return res.status(404).json({ error: "dream not found" });
      const existing = (await listActiveCommitments(householdId)).find(
        (c) => c.kind === "sweep" && c.targetGoalId === id,
      );
      if (weekly < 25) {
        if (existing) await updateCommitment(householdId, existing.id, { status: "ended", endedReason: "set_to_zero" });
        await db.update(goals).set({ weeklyAuto: 0 }).where(eq(goals.id, id));
      } else {
        await createSweepCommitment({
          householdId,
          userId: req.user.id,
          goalId: id,
          amount: Math.round(weekly),
          consentFrame: "dreams_auto_save",
        });
      }
      const [updated] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
      const [wire] = await enrich([updated], householdId);
      res.json({ dream: wire });
    } catch (err) {
      console.error("/api/dreams/:id/auto-save error:", err);
      res.status(500).json({ error: "auto-save failed" });
    }
  });
}
