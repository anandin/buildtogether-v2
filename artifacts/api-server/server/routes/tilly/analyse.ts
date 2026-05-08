/**
 * On-demand "Analyse my money flow" — task #24.
 *
 * One button in BTGuardian. Tilly pulls the last 90 days of expenses
 * (Plaid + manual), her dossier, and the top retrieved memories, then
 * runs a single Sonnet/Opus call that returns a structured analysis card
 * persisted as guardian_conversations role="guardian", intent="analysis".
 *
 * Throttled to once per 3 minutes per user — both via an in-process Map
 * (cheap fast path) and a DB lookup of the latest analysis row (survives
 * server restarts). 429 with a friendly Tilly-voiced text on throttle.
 */
import type { Express, Request, Response } from "express";
import { eq, and, sql, desc, gte } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import {
  guardianConversations,
  expenses,
  plaidTransactions,
} from "../../../shared/schema";
import {
  getLatestDossier,
  formatDossierForPrompt,
  DossierContentSchema,
} from "../../tilly/dossier-rewriter";
import { hybridRetrieve } from "../../tilly/retriever";
import { callTilly } from "../../tilly/persona";
import { logRetrieval } from "../../tilly/retrieval-log";
import { getTillyConfig } from "../../tilly/llm/factory";
import { emitEventAsync } from "../../tilly/event-emitter";

const THROTTLE_MS = 3 * 60 * 1000;
const lastRunAt = new Map<string, number>();

type AnalysisRow = { label: string; amt: number; sign: "+" | "-" | "=" };
type Tx = { amount: number; merchant: string; category: string };

interface AnalysisPayload {
  title: string;
  rows: AnalysisRow[];
  note: string;
  anomalies: { merchant: string; total: number; reason: "spike" | "new"; baseline?: number }[];
  openQuestions: string[];
  memoryLine: string | null;
}

// ─── Data gathering ────────────────────────────────────────────────────────

interface AnomalyHit {
  merchant: string;
  total: number;
  count: number;
  reason: "spike" | "new";
  baseline?: number;
}

async function gather90DaySpend(householdId: string): Promise<{
  rows: AnalysisRow[];
  topMerchants: { name: string; total: number; count: number }[];
  byCategory: { name: string; total: number; pct: number }[];
  anomalies: AnomalyHit[];
  totalSpend: number;
  txCount: number;
  windowStart: string;
}> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceIso = since.toISOString().slice(0, 10);

  const [plaid, manual] = await Promise.all([
    db
      .select()
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          sql`${plaidTransactions.date} >= ${sinceIso}`,
          sql`${plaidTransactions.amount} > 0`,
          // Only finalized transactions count toward the money-flow
          // narrative — pending_review and ignored rows are noise.
          eq(plaidTransactions.status, "accepted"),
        ),
      ),
    db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          sql`${expenses.date} >= ${sinceIso}`,
          sql`${expenses.amount} > 0`,
        ),
      ),
  ]);

  const all: Tx[] = [];
  for (const t of plaid) {
    all.push({
      amount: t.amount,
      merchant: (t.merchantName || t.name || "Unknown").trim(),
      category: (t.ourCategory || "Uncategorized").trim(),
    });
  }
  for (const e of manual) {
    if (e.source === "plaid") continue;
    all.push({
      amount: e.amount,
      merchant: (e.merchant || e.description || "Manual").trim(),
      category: (e.category || "other").trim(),
    });
  }

  const totalSpend = all.reduce((s, t) => s + t.amount, 0);
  const merchMap = new Map<string, { total: number; count: number }>();
  const catMap = new Map<string, number>();
  for (const t of all) {
    const m = merchMap.get(t.merchant) ?? { total: 0, count: 0 };
    m.total += t.amount;
    m.count += 1;
    merchMap.set(t.merchant, m);
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
  }
  const topMerchants = Array.from(merchMap.entries())
    .map(([name, v]) => ({ name, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
  const byCategory = Array.from(catMap.entries())
    .map(([name, total]) => ({
      name,
      total,
      pct: totalSpend > 0 ? total / totalSpend : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // Build the structured rows the analysis card renders. Top categories
  // become signed lines, with totalSpend as the "=" footer.
  const rows: AnalysisRow[] = byCategory.map((c) => ({
    label: c.name.toUpperCase(),
    amt: Math.round(c.total * 100) / 100,
    sign: "-" as const,
  }));
  rows.push({
    label: "90-DAY TOTAL",
    amt: Math.round(totalSpend * 100) / 100,
    sign: "=" as const,
  });

  // Anomaly detection — simple, deterministic, transparent.
  // (a) "spike": merchant total in last 30d > 2× average of the prior
  //     60d window (only fire if both windows have >=1 charge).
  // (b) "new":   merchant first seen in last 30d, with total > $30.
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoffIso = cutoff30.toISOString().slice(0, 10);
  type WTx = Tx & { date: string };
  const allWithDates: WTx[] = [];
  for (const t of plaid) {
    allWithDates.push({
      amount: t.amount,
      merchant: (t.merchantName || t.name || "Unknown").trim(),
      category: (t.ourCategory || "Uncategorized").trim(),
      date: String(t.date),
    });
  }
  for (const e of manual) {
    if (e.source === "plaid") continue;
    allWithDates.push({
      amount: e.amount,
      merchant: (e.merchant || e.description || "Manual").trim(),
      category: (e.category || "other").trim(),
      date: String(e.date),
    });
  }
  const recent = new Map<string, { total: number; count: number }>();
  const prior = new Map<string, { total: number; count: number }>();
  for (const t of allWithDates) {
    const bucket = t.date >= cutoffIso ? recent : prior;
    const v = bucket.get(t.merchant) ?? { total: 0, count: 0 };
    v.total += t.amount;
    v.count += 1;
    bucket.set(t.merchant, v);
  }
  const anomalies: AnomalyHit[] = [];
  for (const [merchant, r] of recent.entries()) {
    const p = prior.get(merchant);
    if (!p) {
      if (r.total >= 30) {
        anomalies.push({ merchant, total: r.total, count: r.count, reason: "new" });
      }
      continue;
    }
    // Normalize prior to a 30-day rate (it covered 60 days).
    const priorRate = p.total / 2;
    if (priorRate > 0 && r.total > 2 * priorRate && r.total >= 25) {
      anomalies.push({
        merchant,
        total: r.total,
        count: r.count,
        reason: "spike",
        baseline: Math.round(priorRate * 100) / 100,
      });
    }
  }
  // Largest moves first; cap at 4 so the card stays scannable.
  anomalies.sort((a, b) => b.total - a.total);
  const topAnomalies = anomalies.slice(0, 4);

  return {
    rows,
    topMerchants,
    byCategory,
    anomalies: topAnomalies,
    totalSpend,
    txCount: all.length,
    windowStart: sinceIso,
  };
}

// ─── Throttle check ────────────────────────────────────────────────────────

async function checkAndReserveThrottle(
  userId: string,
): Promise<{ throttled: boolean; remainingMs: number }> {
  const now = Date.now();

  // Fast in-memory check + atomic CAS-like reservation. Since Node is
  // single-threaded per process, set-then-check is safe against the
  // concurrent-request race the architect flagged: whichever request
  // wins setLastRun first blocks all siblings until the LLM finishes
  // (or until the throttle window elapses, whichever is later).
  const memHit = lastRunAt.get(userId);
  if (memHit && now - memHit < THROTTLE_MS) {
    return { throttled: true, remainingMs: THROTTLE_MS - (now - memHit) };
  }

  // DB-backed check survives server restarts. Per-USER (not household) —
  // co-spending pair members each get their own 3-min window. Looks at
  // both successful analysis cards we wrote AND the synthetic
  // "analysis_request" user rows so a request that's already in flight
  // (LLM call still pending) blocks siblings too.
  const cutoff = new Date(now - THROTTLE_MS);
  const recent = await db
    .select({ createdAt: guardianConversations.createdAt })
    .from(guardianConversations)
    .where(
      and(
        eq(guardianConversations.userId, userId),
        sql`${guardianConversations.intent} IN ('analysis', 'analysis_request')`,
        gte(guardianConversations.createdAt, cutoff),
      ),
    )
    .orderBy(desc(guardianConversations.createdAt))
    .limit(1);
  if (recent[0]) {
    const elapsed = now - recent[0].createdAt.getTime();
    if (elapsed < THROTTLE_MS) {
      lastRunAt.set(userId, recent[0].createdAt.getTime());
      return { throttled: true, remainingMs: THROTTLE_MS - elapsed };
    }
  }

  // Reserve the slot BEFORE doing any work. Concurrent requests racing
  // past the DB check above will hit the in-memory guard on the next
  // iteration — first writer wins.
  lastRunAt.set(userId, now);
  return { throttled: false, remainingMs: 0 };
}

// ─── Main handler ──────────────────────────────────────────────────────────

export function mountTillyAnalyseRoutes(app: Express): void {
  app.post(
    "/api/tilly/analyse",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      if (!householdId) {
        return res
          .status(400)
          .json({ error: "no household — link an account first" });
      }

      const t0 = Date.now();

      try {
        const throttle = await checkAndReserveThrottle(userId);
        if (throttle.throttled) {
          const mins = Math.ceil(throttle.remainingMs / 60000);
          console.log(
            `[analyse] throttled user=${userId} remainingMs=${throttle.remainingMs}`,
          );
          return res.status(429).json({
            error: "throttled",
            retryInMs: throttle.remainingMs,
            message: `Just ran one. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
          });
        }

        // Persist the user's "synthetic" prompt so the chat history
        // shows what triggered this card. Mirrors how scout / wait
        // proposals appear in the transcript.
        const userPromptText = "Analyse my money flow.";
        const [userRow] = await db
          .insert(guardianConversations)
          .values({
            coupleId: householdId,
            userId,
            role: "user",
            content: userPromptText,
            intent: "analysis_request",
          })
          .returning();

        // 1. Gather data in parallel.
        const config = await getTillyConfig();
        const [spend, dossierRow, retrieved] = await Promise.all([
          gather90DaySpend(householdId),
          getLatestDossier(userId),
          hybridRetrieve(userId, "money flow spending patterns last 90 days"),
        ]);

        // 2. Build the system context block.
        const sections: string[] = [];
        if (dossierRow) {
          const parsed = DossierContentSchema.safeParse(dossierRow.content);
          if (parsed.success) sections.push(formatDossierForPrompt(parsed.data));
        }
        const merchantBlock = spend.topMerchants.length
          ? spend.topMerchants
              .map(
                (m) =>
                  `- ${m.name}: $${m.total.toFixed(2)} across ${m.count} charge${m.count === 1 ? "" : "s"}`,
              )
              .join("\n")
          : "(no merchants in window)";
        const categoryBlock = spend.byCategory.length
          ? spend.byCategory
              .map(
                (c) =>
                  `- ${c.name}: $${c.total.toFixed(2)} (${(c.pct * 100).toFixed(0)}%)`,
              )
              .join("\n")
          : "(no categorized spend)";
        sections.push(
          `90-day money picture (since ${spend.windowStart}, ${spend.txCount} transactions, total $${spend.totalSpend.toFixed(2)}):

By category:
${categoryBlock}

Top merchants:
${merchantBlock}`,
        );
        if (retrieved.length) {
          sections.push(
            `What you remember about them (top retrieved memories):\n${retrieved
              .map((m) => `- [${m.kind}, ${m.dateLabel}] ${m.body}`)
              .join("\n")}`,
          );
        }
        sections.push(
          `TASK: Write a short editorial paragraph (2-3 sentences) that summarizes their last 90 days of money flow. Reference one concrete pattern you see (a category, a merchant, a habit shift) and tie it to something you remember about them when relevant. Then ONE specific suggestion they could try this week. No bullet points. No headers. No markdown. No emoji. Plain serif paragraph in your usual voice. Keep it under 90 words. Do NOT repeat the numbers — the card already shows them.`,
        );

        const extraSystem = sections.join("\n\n");

        // 3. Single LLM call.
        const tone = "sibling" as const; // analysis card always uses neutral sibling
        const reply = await callTilly({
          toneKey: tone,
          messages: [{ role: "user", content: userPromptText }],
          extraSystem,
          maxTokens: 600,
        });

        const note = (reply.text || "").trim() ||
          "Looked at the last 90 days. The shape is steady — nothing screaming at me.";

        // Open questions: surface up to two of the dossier's open_loops
        // so the analysis card honours the "questions Tilly still has"
        // requirement without burning another LLM call.
        const openQuestions: string[] = (() => {
          if (!dossierRow) return [];
          const parsed = DossierContentSchema.safeParse(dossierRow.content);
          if (!parsed.success) return [];
          return (parsed.data.open_loops ?? []).slice(0, 2);
        })();

        // Memory provenance: one line, plain language. Pulled into the
        // card UI so users see which past notes Tilly leaned on.
        const memoryLine = retrieved.length
          ? `Drew on ${retrieved.length} past note${retrieved.length === 1 ? "" : "s"} (${
              Array.from(new Set(retrieved.map((m) => m.kind))).join(", ")
            }).`
          : null;

        // 4. Build & persist the analysis card.
        const payload: AnalysisPayload = {
          title: "90-DAY MONEY FLOW",
          rows: spend.rows,
          note,
          anomalies: spend.anomalies.map((a) => ({
            merchant: a.merchant,
            total: Math.round(a.total * 100) / 100,
            reason: a.reason,
            baseline: a.baseline,
          })),
          openQuestions,
          memoryLine,
        };
        const [tillyRow] = await db
          .insert(guardianConversations)
          .values({
            coupleId: householdId,
            userId,
            role: "guardian",
            content: note,
            intent: "analysis",
            metadata: payload,
          })
          .returning();

        // 5. Log retrieval for admin transparency.
        await logRetrieval({
          userId,
          conversationId: tillyRow.id,
          kind: "analysis",
          memories: retrieved,
          strategy: config.retrievalStrategy,
          promptSize: extraSystem.length,
        });

        // Re-stamp on success so the cooldown is anchored to completion,
        // not to the moment we reserved the slot.
        lastRunAt.set(userId, Date.now());

        emitEventAsync({
          userId,
          householdId,
          kind: "analysis_run",
          payload: {
            txCount: spend.txCount,
            totalSpend: spend.totalSpend,
            memoryCount: retrieved.length,
            durationMs: Date.now() - t0,
          },
          sourceTable: "guardian_conversations",
          sourceId: tillyRow.id,
        });

        console.log(
          `[analyse] ok user=${userId} tx=${spend.txCount} mem=${retrieved.length} ` +
            `tokIn=${reply.usage.inputTokens} tokOut=${reply.usage.outputTokens} ` +
            `model=${reply.modelId} durMs=${Date.now() - t0}`,
        );

        res.json({
          reply: {
            id: tillyRow.id,
            role: "tilly",
            kind: "analysis",
            title: payload.title,
            rows: payload.rows,
            note: payload.note,
            anomalies: payload.anomalies,
            openQuestions: payload.openQuestions,
            memoryLine: payload.memoryLine,
            scoutProposal: null,
            waitProposal: null,
            createdAt: tillyRow.createdAt.toISOString(),
          },
          userMessage: {
            id: userRow.id,
            role: "user",
            kind: "text",
            body: userPromptText,
            createdAt: userRow.createdAt.toISOString(),
          },
        });
      } catch (err: any) {
        // Free the in-mem reservation so the user isn't locked out for
        // 3 min after a failure — the DB-backed check still prevents
        // hammering if a synthetic "analysis_request" row was written.
        lastRunAt.delete(userId);
        console.error("/api/tilly/analyse error:", err);
        res.status(500).json({ error: "analysis failed" });
      }
    },
  );
}
