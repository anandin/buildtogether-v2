/**
 * Task #23 — sync-time questions API.
 *
 * GET    /api/tilly/questions          → up to 3 OPEN questions for the household
 * POST   /api/tilly/questions/:id/answer    body { answer, action?, category?, tags?, note? }
 *        - marks the question answered
 *        - if action==="create_rule", upserts a merchant rule from the answer
 *          (so Tilly never asks again about this merchant)
 * POST   /api/tilly/questions/:id/dismiss   silent dismiss
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { tillyQuestions, plaidTransactions, tillyMemory } from "../../../shared/schema";
import type { PlaidTransaction } from "../../../shared/schema";
import { requireAuth } from "../../middleware/auth";
import { upsertRuleFromAccept } from "../../tilly/merchant-rules";

type QuestionPayload = {
  signature?: string;
  pendingIds?: string[];
  category?: string;
  [key: string]: unknown;
};

export function mountTillyQuestionsRoutes(app: Express): void {
  app.get("/api/tilly/questions", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ questions: [] });
    const rows = await db
      .select()
      .from(tillyQuestions)
      .where(
        and(
          eq(tillyQuestions.householdId, householdId),
          eq(tillyQuestions.status, "open"),
        ),
      )
      .orderBy(desc(tillyQuestions.createdAt))
      .limit(3);
    res.json({ questions: rows });
  });

  app.post("/api/tilly/questions/:id/answer", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const { answer, action, category, tags, note } = req.body || {};
    const [q] = await db
      .select()
      .from(tillyQuestions)
      .where(eq(tillyQuestions.id, String(req.params.id)))
      .limit(1);
    if (!q) return res.status(404).json({ error: "Question not found" });
    if (q.householdId !== req.user.coupleId) return res.status(403).json({ error: "Access denied" });
    if (q.status !== "open") return res.json({ ok: true, alreadyClosed: true });

    await db
      .update(tillyQuestions)
      .set({
        status: "answered",
        answer: typeof answer === "string" ? answer.slice(0, 500) : null,
        answeredAt: new Date(),
      })
      .where(eq(tillyQuestions.id, q.id));

    let ruleCreated = false;
    if (action === "create_rule") {
      try {
        // Pick a representative tx for signature/display info. Prefer one of
        // the ids the generator captured in payload; otherwise look up one
        // from the household with the same signature.
        const payload = (q.payload ?? {}) as QuestionPayload;
        const sig = typeof payload.signature === "string" ? payload.signature : undefined;
        let plaidTx: PlaidTransaction | null = null;
        if (Array.isArray(payload.pendingIds) && payload.pendingIds.length > 0) {
          const [row] = await db
            .select()
            .from(plaidTransactions)
            .where(eq(plaidTransactions.id, payload.pendingIds[0]))
            .limit(1);
          plaidTx = row ?? null;
        }
        if (!plaidTx && sig && req.user.coupleId) {
          const [row] = await db
            .select()
            .from(plaidTransactions)
            .where(
              and(
                eq(plaidTransactions.coupleId, req.user.coupleId),
                eq(plaidTransactions.signature, sig),
              ),
            )
            .limit(1);
          plaidTx = row ?? null;
        }
        if (plaidTx && req.user.coupleId) {
          await upsertRuleFromAccept({
            coupleId: req.user.coupleId,
            plaidTx,
            category: typeof category === "string" ? category : null,
            tags: Array.isArray(tags) ? tags : null,
            note: typeof note === "string" ? note : null,
            source: "asked",
          });
          ruleCreated = true;
        }
      } catch (err) {
        console.warn("[tilly-questions] create_rule failed:", err);
      }
    }

    // Task #23 fix: persist non-rule answers to tillyMemory so the
    // assistant remembers the user's response next time they chat ("you
    // told me Frank Bistro is your weekly Friday lunch spot"). Without
    // this, an answered "what is X?" disappears the moment the row is
    // closed and Tilly could ask again on a subsequent merchant.
    if (!ruleCreated && typeof answer === "string" && answer.trim()) {
      try {
        const trimmed = answer.trim().slice(0, 500);
        const today = new Date();
        const dateLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        await db.insert(tillyMemory).values({
          userId: req.user.id,
          householdId: req.user.coupleId,
          kind: "observation",
          body: `You told me about "${q.body}" — ${trimmed}`,
          source: "chat",
          dateLabel,
        });
      } catch (memErr) {
        console.warn("[tilly-questions] memory write failed:", memErr);
      }
    }

    res.json({ ok: true, ruleCreated });
  });

  app.post("/api/tilly/questions/:id/dismiss", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const [q] = await db
      .select()
      .from(tillyQuestions)
      .where(eq(tillyQuestions.id, String(req.params.id)))
      .limit(1);
    if (!q) return res.status(404).json({ error: "Question not found" });
    if (q.householdId !== req.user.coupleId) return res.status(403).json({ error: "Access denied" });
    await db
      .update(tillyQuestions)
      .set({ status: "dismissed", answeredAt: new Date() })
      .where(eq(tillyQuestions.id, q.id));
    res.json({ ok: true });
  });
}
