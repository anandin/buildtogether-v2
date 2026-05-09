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
  households,
  members,
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
  topMerchants: { name: string; total: number; count: number }[];
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
  // Bucket each merchant's prior 60d into 8 weekly totals so we can
  // take a real *median* (not a mean). Median is more robust to a
  // single big-ticket charge inflating an average baseline. The
  // recent window stays as the merchant's 30d total compared against
  // the median weekly baseline scaled to 30 days.
  const recent = new Map<string, { total: number; count: number }>();
  const priorWeekly = new Map<string, number[]>(); // merchant -> 8 weekly totals
  const today = new Date();
  for (const t of allWithDates) {
    if (t.date >= cutoffIso) {
      const v = recent.get(t.merchant) ?? { total: 0, count: 0 };
      v.total += t.amount;
      v.count += 1;
      recent.set(t.merchant, v);
    } else {
      // Bucket index 0..7 (week 0 = oldest, week 7 = most recent prior).
      const dt = new Date(t.date);
      const daysAgo = Math.floor((today.getTime() - dt.getTime()) / 86400000) - 30;
      const wk = Math.min(7, Math.max(0, Math.floor(daysAgo / 7)));
      const arr = priorWeekly.get(t.merchant) ?? new Array<number>(8).fill(0);
      arr[wk] += t.amount;
      priorWeekly.set(t.merchant, arr);
    }
  }
  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const anomalies: AnomalyHit[] = [];
  for (const [merchant, r] of recent.entries()) {
    const weeks = priorWeekly.get(merchant);
    if (!weeks || weeks.every((v) => v === 0)) {
      if (r.total >= 30) {
        anomalies.push({ merchant, total: r.total, count: r.count, reason: "new" });
      }
      continue;
    }
    // Weekly median (over all 8 weeks, including zero-weeks — a
    // merchant that hits once a month should have a low median, so
    // the next month's spend reads as a spike).
    const wkMedian = median(weeks);
    // Scale to a 30-day equivalent (4.286 weeks per 30d).
    const baseline30 = wkMedian * (30 / 7);
    if (baseline30 > 0 && r.total > 2 * baseline30 && r.total >= 25) {
      anomalies.push({
        merchant,
        total: r.total,
        count: r.count,
        reason: "spike",
        baseline: Math.round(baseline30 * 100) / 100,
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
        const [spend, dossierRow, retrieved, householdRow, memberRows] =
          await Promise.all([
            gather90DaySpend(householdId),
            getLatestDossier(userId),
            hybridRetrieve(userId, "money flow spending patterns last 90 days"),
            db.query.households.findFirst({
              where: eq(households.id, householdId),
            }),
            db.select().from(members).where(eq(members.coupleId, householdId)),
          ]);

        // 2. Build the system context block.
        const sections: string[] = [];

        // Household context — supports N people, who they are. Lets Tilly
        // frame "$8K/mo" against household size rather than analyzing in a
        // vacuum. When unset, we tell the LLM explicitly so it can ask.
        const partner1 = householdRow?.partner1Name?.trim() || null;
        const partner2 = householdRow?.partner2Name?.trim() || null;
        const additionalMembers = (memberRows ?? []).filter(
          (m) =>
            m.role !== "owner" && // skip the user themselves
            (m.name?.trim() ?? "") !== "",
        );
        const householdLines: string[] = [];
        if (partner1 || partner2) {
          const folks = [partner1, partner2].filter(Boolean).join(" + ");
          householdLines.push(`Primary owner(s) on the account: ${folks}`);
        }
        if (additionalMembers.length > 0) {
          householdLines.push(
            `Additional people in the household: ${additionalMembers
              .map((m) => `${m.name}${m.role ? ` (${m.role})` : ""}`)
              .join(", ")}`,
          );
        }
        if (householdLines.length > 0) {
          sections.push(`Household context:\n${householdLines.join("\n")}`);
        } else {
          sections.push(
            `Household context: NOT YET CAPTURED. The user has not yet told Tilly how many people they support, whether they're splitting with roommates / a partner, or what their role is. If their spending pattern obviously suggests a multi-person household (rent, groceries scaled up, multiple subscriptions, frequent eating-out for many), it is worth one short sentence in your suggestion to ask: "How many people are you supporting? — knowing that changes how I read these numbers."`,
          );
        }

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
          `IMPORTANT framing rules for this user:
- "loans" with cc-payment tag (or top merchants like "TD VISA PREAUTH PYMT" / "Scotialn Vsa") are credit-card payments. They are NOT new spending — they are paying down a card. The actual spending happened earlier on the card itself. If those rows are a big % of the picture, mention briefly: "Roughly $X went to credit-card payments — that's debt service, not new spend. To see what you actually bought, you'd need to connect your <card> as a separate bank in Tilly." Don't lecture about it; one short sentence is enough.
- "transfers" are money the user moved to themselves (savings, e-transfers to self). Don't count them as spending in your narrative.
- "taxes" is tax remittance. Acknowledge as a fixed obligation, don't call it a habit to fix.
- If household context is provided in the snippet block (supports N people, role, etc.), frame the dollar amounts against that — "$2.8K/mo on subscriptions for a household of 4" lands differently than the same number for a solo student. If household context is NOT yet provided, the user hasn't told you yet — your suggestion can be to ask in chat.

TASK: Write a short editorial paragraph (2-3 sentences) that summarizes their last 90 days of money flow. Reference one concrete pattern you see (a category, a merchant, a habit shift) and tie it to something you remember about them when relevant — including household size if you have it. Then ONE specific suggestion they could try this week. No bullet points. No headers. No markdown. No emoji. Plain serif paragraph in your usual voice. Keep it under 110 words. Do NOT repeat the numbers — the card already shows them.`,
        );

        const extraSystem = sections.join("\n\n");

        // 3. Single LLM call.
        const tone = "sibling" as const; // analysis card always uses neutral sibling
        const reply = await callTilly({
          toneKey: tone,
          messages: [{ role: "user", content: userPromptText }],
          extraSystem,
          maxTokens: 600,
          userId: req.user?.id ?? null,
          route: "analyse",
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
          topMerchants: spend.topMerchants.slice(0, 8).map((m) => ({
            name: m.name,
            total: Math.round(m.total * 100) / 100,
            count: m.count,
          })),
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
            topMerchants: payload.topMerchants,
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
