/**
 * Money habits — v3.
 *
 *   GET  /api/habits                 list + streaks + Tilly suggestions
 *   POST /api/habits                 create (user or accepted suggestion)
 *   POST /api/habits/:id/checkin     record a check-in
 *   POST /api/habits/:id/archive     retire a habit
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import {
  archiveHabit,
  checkInHabit,
  createHabit,
  listHabits,
  suggestHabits,
} from "../tilly/habits-service";

export function mountHabitRoutes(app: Express): void {
  app.get("/api/habits", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ ready: true, habits: [], suggestions: [] });
    try {
      const [habits, suggestions] = await Promise.all([
        listHabits(householdId, req.user.id),
        suggestHabits(householdId, req.user.id),
      ]);
      res.json({ ready: true, habits, suggestions });
    } catch (err) {
      console.error("/api/habits GET error:", err);
      res.status(500).json({ error: "habits failed" });
    }
  });

  app.post("/api/habits", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const body = (req.body ?? {}) as {
      title?: string;
      kind?: string;
      cadence?: string;
      targetAmount?: number | null;
      reason?: string | null;
      source?: string;
    };
    try {
      const habit = await createHabit({
        householdId,
        userId: req.user.id,
        title: body.title,
        kind: body.kind,
        cadence: body.cadence,
        targetAmount: typeof body.targetAmount === "number" ? body.targetAmount : null,
        reason: body.reason ?? null,
        source: body.source === "tilly" ? "tilly" : "user",
      });
      res.json({ habit });
    } catch (err) {
      console.error("/api/habits POST error:", err);
      res.status(500).json({ error: "create failed" });
    }
  });

  app.post("/api/habits/:id/checkin", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    const body = (req.body ?? {}) as {
      date?: string;
      note?: string | null;
      amount?: number | null;
      completed?: boolean;
    };
    try {
      const habit = await checkInHabit({
        householdId,
        userId: req.user.id,
        habitId: String(req.params.id),
        date: body.date,
        note: body.note ?? null,
        amount: typeof body.amount === "number" ? body.amount : null,
        completed: body.completed,
      });
      if (!habit) return res.status(404).json({ error: "habit not found" });
      res.json({ habit });
    } catch (err) {
      console.error("/api/habits checkin error:", err);
      res.status(500).json({ error: "checkin failed" });
    }
  });

  app.post("/api/habits/:id/archive", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.status(400).json({ error: "no household" });
    try {
      const ok = await archiveHabit(householdId, req.user.id, String(req.params.id));
      if (!ok) return res.status(404).json({ error: "habit not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("/api/habits archive error:", err);
      res.status(500).json({ error: "archive failed" });
    }
  });
}
