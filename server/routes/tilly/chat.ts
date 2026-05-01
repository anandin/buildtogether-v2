/**
 * Tilly chat endpoint — spec §4.2 + §5.6.
 *
 * Each turn:
 *   1. Persist user message → guardian_conversations
 *   2. Classify intent (affordability question vs general)
 *   3. Generate reply via Claude (analyzeAffordability returns a structured
 *      analysis card; plain chat goes through callTilly)
 *   4. Persist Tilly reply
 *   5. Fire memory extraction async (NEVER blocks the response)
 *   6. Return reply to client
 *
 * History endpoint reads from guardian_conversations and returns the chat
 * reconstructed in the BT message shape.
 */
import type { Express, Request, Response } from "express";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import {
  guardianConversations,
  tillyTonePref,
  tillyMemory,
  tillyReminders,
  tillyEvents,
  tillyMemoryV2,
  tillyNudges,
  tillyScoutJobs,
  users,
} from "../../../shared/schema";
import { enqueueScout } from "../../tilly/scout/orchestrator";
import { distillUser } from "../../tilly/nightly-distiller";
import {
  rewriteDossier,
  getLatestDossier,
  formatDossierForPrompt,
  DossierContentSchema,
} from "../../tilly/dossier-rewriter";
import {
  recordNudgeSent,
  resolveNudge,
  findLatestPendingNudge,
} from "../../tilly/nudge-log";
import { pickFrame, getFrameStats } from "../../tilly/frame-bandit";
import {
  callTilly,
} from "../../tilly/persona";
import {
  analyzeAffordability,
  type AffordabilityAnalysis,
} from "../../tilly/analyze-affordability";
import { extractMemories } from "../../tilly/memory-writer";
import { embed } from "../../tilly/embeddings";
import { retrieveContextSnippets } from "../../tilly/retriever";
import { assertUnderCap } from "../../tilly/usage";
import { buildFinancialStateSummary } from "../../tilly/state-summary";
import { extractReminderFromReply } from "../../tilly/reminder-classifier";
import { emitEventAsync } from "../../tilly/event-emitter";
import {
  isValidTone,
  DEFAULT_TONE,
  type BTToneKey,
} from "../../tilly/tone";

// ─── Tone helpers ──────────────────────────────────────────────────────────

async function getTone(userId: string): Promise<BTToneKey> {
  const pref = await db.query.tillyTonePref.findFirst({
    where: eq(tillyTonePref.userId, userId),
  });
  if (pref && isValidTone(pref.tone)) return pref.tone;
  return DEFAULT_TONE;
}

async function setUserTone(userId: string, tone: BTToneKey): Promise<void> {
  // Upsert via insert ... on conflict do update.
  await db
    .insert(tillyTonePref)
    .values({ userId, tone, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tillyTonePref.userId,
      set: { tone, updatedAt: new Date() },
    });
}

// ─── Intent classification ─────────────────────────────────────────────────

/**
 * Lightweight regex-based classifier. The spec's "Quick math" card fires for
 * affordability questions ("can I afford the $90 ticket?"). Everything else
 * goes through plain chat. Phase 4 can replace this with a Claude classifier
 * if we need to handle edge cases.
 */
function isAffordabilityQuestion(text: string): boolean {
  const t = text.toLowerCase();
  // Money mention or amount + a "can I / is this OK / should I" framing
  const hasMoney = /\$\s?\d+|\bdollars?\b/.test(t);
  const hasAsk =
    /\b(can i afford|afford|is it (okay|ok|fine)|should i|can i)\b/.test(t);
  return hasMoney && hasAsk;
}

// Memory context now comes from the hybrid retriever (RAG, spec D7).
// `retrieveContextSnippets(userId, queryText)` runs cosine over the user's
// active memory embeddings + recency boost, returns the top-K most relevant.

// ─── Persisted-message → wire shape ────────────────────────────────────────

type ScoutProposal = { query: string; reason: string };
type WaitProposal = { query: string; reason: string };
type ScoutWireOption = {
  source: string;
  title: string;
  price?: string;
  location?: string;
  url: string;
  condition?: string;
  why: string;
};
type WaitWireSource = { source: string; url: string; evidence: string };

type WireMessage =
  | { id: string; role: "user"; kind: "text"; body: string; createdAt: string }
  | { id: string; role: "tilly"; kind: "text"; body: string; createdAt: string }
  | {
      id: string;
      role: "tilly";
      kind: "analysis";
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
      scoutProposal?: ScoutProposal | null;
      waitProposal?: WaitProposal | null;
      createdAt: string;
    }
  | {
      id: string;
      role: "tilly";
      kind: "scout";
      jobId: string;
      query: string;
      location: string | null;
      status: "queued" | "running" | "done" | "failed";
      summary: string | null;
      options: ScoutWireOption[];
      errorText: string | null;
      createdAt: string;
    }
  | {
      id: string;
      role: "tilly";
      kind: "wait";
      jobId: string;
      query: string;
      location: string | null;
      status: "queued" | "running" | "done" | "failed";
      summary: string | null;
      shouldWait: boolean | null;
      waitUntil: string | null;
      expectedSaving: string | null;
      confidence: "low" | "medium" | "high" | null;
      sources: WaitWireSource[];
      errorText: string | null;
      createdAt: string;
    };

function rowToWire(
  row: typeof guardianConversations.$inferSelect,
  scoutById?: Map<string, typeof tillyScoutJobs.$inferSelect>,
): WireMessage {
  const role = row.role === "user" ? "user" : "tilly";
  // Analysis cards: stored as role="guardian", intent="analysis", with the
  // structured payload (rows, note, scoutProposal) in metadata jsonb.
  if (
    role === "tilly" &&
    row.intent === "analysis" &&
    row.metadata &&
    typeof row.metadata === "object" &&
    "rows" in row.metadata
  ) {
    const m = row.metadata as {
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
      scoutProposal?: ScoutProposal | null;
      waitProposal?: WaitProposal | null;
    };
    return {
      id: row.id,
      role: "tilly",
      kind: "analysis",
      title: m.title,
      rows: m.rows,
      note: m.note,
      scoutProposal: m.scoutProposal ?? null,
      waitProposal: m.waitProposal ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  // Scout / wait messages: role=guardian, intent in {scout, wait}, metadata
  // points at a tilly_scout_jobs row. The current state comes from the
  // joined job so the bubble updates as the job progresses. Wait jobs share
  // the same table but carry a different result shape.
  if (
    role === "tilly" &&
    (row.intent === "scout" || row.intent === "wait") &&
    row.metadata &&
    typeof row.metadata === "object" &&
    "jobId" in row.metadata
  ) {
    const m = row.metadata as {
      jobId: string;
      query: string;
      location: string | null;
    };
    const job = scoutById?.get(m.jobId);
    const status = (job?.status as "queued" | "running" | "done" | "failed") ?? "queued";
    if (row.intent === "wait") {
      const advice = (job?.result ?? null) as
        | {
            shouldWait?: boolean;
            waitUntil?: string | null;
            expectedSaving?: string | null;
            confidence?: "low" | "medium" | "high";
            sources?: WaitWireSource[];
            summary?: string;
          }
        | null;
      return {
        id: row.id,
        role: "tilly",
        kind: "wait",
        jobId: m.jobId,
        query: m.query,
        location: m.location ?? null,
        status,
        summary: advice?.summary ?? null,
        shouldWait: typeof advice?.shouldWait === "boolean" ? advice.shouldWait : null,
        waitUntil: advice?.waitUntil ?? null,
        expectedSaving: advice?.expectedSaving ?? null,
        confidence: advice?.confidence ?? null,
        sources: advice?.sources ?? [],
        errorText: job?.errorText ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    }
    const result = (job?.result ?? null) as
      | { options?: ScoutWireOption[]; summary?: string }
      | null;
    return {
      id: row.id,
      role: "tilly",
      kind: "scout",
      jobId: m.jobId,
      query: m.query,
      location: m.location ?? null,
      status,
      summary: result?.summary ?? null,
      options: result?.options ?? [],
      errorText: job?.errorText ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  if (role === "user") {
    return {
      id: row.id,
      role: "user",
      kind: "text",
      body: row.content,
      createdAt: row.createdAt.toISOString(),
    };
  }
  return {
    id: row.id,
    role: "tilly",
    kind: "text",
    body: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Decide whether two reminder labels describe the same chore. Used to
 * dedup before insert so Tilly doesn't pile up "Call landlord", "Call
 * your landlord", "Call your landlord about the lease" as 3 separate
 * reminders for the same intent.
 *
 * Strategy:
 *   1. Normalize both — lowercase, strip punctuation, collapse whitespace.
 *   2. If either normalized form is a substring of the other, they match.
 *   3. Otherwise compute Jaccard similarity over word tokens (set
 *      intersection / set union, weighted toward content words). Match
 *      if >= 0.6.
 *
 * Conservative: false positives are worse than false negatives because
 * a false positive silently swallows a real reminder. Substring + 0.6
 * Jaccard is loose enough to catch the obvious dupes, tight enough that
 * "Call your landlord" and "Call your bank" don't collide.
 */
function isReminderDuplicate(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const STOPWORDS = new Set([
    "the", "a", "an", "to", "for", "of", "in", "on", "at", "and", "or",
    "your", "my", "this", "that", "it", "i", "me", "you", "is", "are",
    "be", "by", "with", "about",
  ]);
  const tokens = (s: string) =>
    new Set(s.split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
  const ta = tokens(na);
  const tb = tokens(nb);
  if (ta.size === 0 || tb.size === 0) return false;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect += 1;
  const union = ta.size + tb.size - intersect;
  const jaccard = intersect / union;
  return jaccard >= 0.6;
}

// ─── Reminder extraction ───────────────────────────────────────────────────
//
// Tilly's prompt instructs her to emit `<reminder kind="..." fireAt="ISO"
// label="..."></reminder>` tags whenever she promises a follow-up. This
// function pulls them out of the raw reply, returns the cleaned visible
// text plus a parsed draft list ready for `insert`.
//
// Defensive: if Tilly returns malformed tags or unparseable dates, those
// drafts are silently dropped so the user-visible reply stays clean.
function extractReminderTags(raw: string): {
  cleaned: string;
  reminders: Array<{
    kind: string;
    fireAt: Date;
    label: string;
    metadata?: string;
  }>;
} {
  const reminders: Array<{
    kind: string;
    fireAt: Date;
    label: string;
    metadata?: string;
  }> = [];
  const cleaned = raw
    .replace(
      /<reminder\b([^>]*)>([\s\S]*?)<\/reminder>/gi,
      (_match, attrs: string) => {
        const get = (name: string) => {
          const m = attrs.match(
            new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"),
          );
          return m ? m[1] : "";
        };
        const kind = get("kind") || "generic";
        const fireAtStr = get("fireAt");
        const label = get("label").trim();
        const fireAt = fireAtStr ? new Date(fireAtStr) : null;
        if (label && fireAt && !isNaN(fireAt.getTime())) {
          // Only future-dated reminders make sense. Drop anything in the past.
          if (fireAt.getTime() > Date.now() - 60_000) {
            reminders.push({ kind, fireAt, label });
          }
        }
        return "";
      },
    )
    // Collapse the whitespace gap left where the tag was.
    .replace(/[ \t]*\n\n+\s*$/g, "")
    .trim();
  return { cleaned, reminders };
}

// ─── Routes ────────────────────────────────────────────────────────────────

export function mountTillyChatRoutes(app: Express): void {
  // POST /api/tilly/chat — send a user message, get Tilly's reply.
  app.post("/api/tilly/chat", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const householdId = req.user.coupleId;
    if (!householdId) {
      return res.status(400).json({ error: "no household — complete onboarding first" });
    }

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "message required" });

    // Cost guardrail — refuse early if the user has spent through their daily
    // token budget. Returns 429 with a Tilly-voiced message rather than an
    // opaque server error so the chat surface can render it inline.
    try {
      await assertUnderCap(userId);
    } catch (capErr) {
      return res.status(429).json({
        error: "daily_cap",
        reply: {
          id: "cap-" + Date.now(),
          role: "tilly",
          kind: "text",
          body: "I've thought a lot today. Let's pick this back up tomorrow — or open the admin page if you're testing.",
          createdAt: new Date().toISOString(),
        },
      });
    }

    try {
      const tone = await getTone(userId);

      // 1. Persist user turn
      const [userRow] = await db
        .insert(guardianConversations)
        .values({
          coupleId: householdId,
          userId,
          role: "user",
          content: message,
          intent: isAffordabilityQuestion(message) ? "affordability" : "chat",
        })
        .returning();
      emitEventAsync({
        userId,
        householdId,
        kind: "chat_user_msg",
        payload: { content: message, intent: userRow.intent ?? "chat" },
        sourceTable: "guardian_conversations",
        sourceId: userRow.id,
      });

      // 2. Generate reply
      let reply: WireMessage;
      let analysisPayload: AffordabilityAnalysis | null = null;
      // Surfaced on the response so the client can render an inline
      // confirmation chip on the Tilly turn that promised the
      // follow-up. Replaces the chat-thread "TILLY WILL PING YOU"
      // strip — the chip is bound to the specific bubble that earned it.
      let createdReminder: {
        id: string;
        label: string;
        kind: string;
        fireAt: string;
      } | null = null;

      if (isAffordabilityQuestion(message)) {
        try {
          // Hand the analyzer the real financial state instead of zeros.
          // Without this, the LLM has nothing to anchor "Starting buffer"
          // and either refuses structured output or returns a fabricated
          // ledger — both end up falling through to plain text.
          const state = await buildFinancialStateSummary(householdId);
          // Pull recent expenses too so the "weekly drain" line is real.
          analysisPayload = await analyzeAffordability({
            userMessage: message,
            ledger: {
              balance: 0, // True bank balance lands when Plaid prod approves.
              upcomingBills: [],
              activeDreamAutoSaves: [],
            },
            stateSummary: state.hasData ? state.text : null,
            tone,
            recentMemorySnippets: await retrieveContextSnippets(userId, message),
          });
        } catch (err) {
          // Surface the error so we can diagnose, but don't crash — the
          // plain-text reply still lands.
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            "[tilly chat] analyzeAffordability failed, falling back to text:",
            msg,
          );
        }
      }

      if (analysisPayload) {
        const [tillyRow] = await db
          .insert(guardianConversations)
          .values({
            coupleId: householdId,
            userId,
            role: "guardian",
            content: analysisPayload.note, // text fallback for systems that read content
            intent: "analysis",
            metadata: {
              title: analysisPayload.title,
              rows: analysisPayload.rows,
              note: analysisPayload.note,
              followUp: analysisPayload.followUp,
              scoutProposal: analysisPayload.scoutProposal ?? null,
              waitProposal: analysisPayload.waitProposal ?? null,
            },
          })
          .returning();
        reply = {
          id: tillyRow.id,
          role: "tilly",
          kind: "analysis",
          title: analysisPayload.title,
          rows: analysisPayload.rows,
          note: analysisPayload.note,
          scoutProposal: analysisPayload.scoutProposal ?? null,
          waitProposal: analysisPayload.waitProposal ?? null,
          createdAt: tillyRow.createdAt.toISOString(),
        };
        emitEventAsync({
          userId,
          householdId,
          kind: "chat_tilly_reply",
          payload: {
            kind: "analysis",
            title: analysisPayload.title,
            rows: analysisPayload.rows,
            note: analysisPayload.note,
            inReplyTo: userRow.id,
          },
          sourceTable: "guardian_conversations",
          sourceId: tillyRow.id,
        });
      } else {
        // Plain-text Tilly reply with the recent conversation as context.
        const recent = await db
          .select()
          .from(guardianConversations)
          .where(eq(guardianConversations.coupleId, householdId))
          .orderBy(desc(guardianConversations.createdAt))
          .limit(10);
        const history = recent
          .reverse()
          .map((r) => ({
            role: r.role === "user" ? ("user" as const) : ("assistant" as const),
            content: r.content,
          }));

        const [memSnippets, state, dossierRow] = await Promise.all([
          retrieveContextSnippets(userId, message),
          buildFinancialStateSummary(householdId),
          getLatestDossier(userId),
        ]);
        const sections: string[] = [];
        // S3 dossier — what Tilly believes about this student. Comes
        // FIRST so the persona has the user model before situational
        // context. Validated through the Zod schema before formatting
        // so a corrupt jsonb row can't poison the prompt.
        if (dossierRow) {
          const parsed = DossierContentSchema.safeParse(dossierRow.content);
          if (parsed.success) {
            sections.push(formatDossierForPrompt(parsed.data));
          }
        }
        if (state.hasData) {
          sections.push(
            `Their current state — use this when they ask about money:\n${state.text}\n\nDO NOT say you can't see their balance or that you need them to connect; the data above is your access. If a specific thing isn't listed (e.g. credit utilization), say you don't see THAT specific thing yet.`,
          );
        }
        if (memSnippets.length) {
          sections.push(
            `What you remember about them (in your voice, from RAG):\n${memSnippets.map((s) => `- ${s}`).join("\n")}`,
          );
        }
        const extraSystem = sections.length ? sections.join("\n\n") : undefined;

        const response = await callTilly({
          toneKey: tone,
          messages: history,
          extraSystem,
        });
        const text = response.text;
        // Detect whether Tilly promised a follow-up — Haiku 4.5 classifier
        // (~1-2s, ~250 tok). Inline so the row exists by the time we return,
        // and the client can refetch reminders on the same mutation success.
        try {
          const draft = await extractReminderFromReply(text, message);
          if (draft) {
            // Dedup before insert. The classifier was caught firing on
            // the same intent across multiple turns ("Call your landlord
            // about the lease" + "Call your landlord." minutes apart),
            // resulting in 2-3 visible reminders for the same chore. Look
            // up existing scheduled reminders within ±1h of the new
            // fireAt and skip if any has a fuzzy-matching label.
            const winStart = new Date(draft.fireAt.getTime() - 60 * 60 * 1000);
            const winEnd = new Date(draft.fireAt.getTime() + 60 * 60 * 1000);
            const existing = await db
              .select()
              .from(tillyReminders)
              .where(
                and(
                  eq(tillyReminders.userId, userId),
                  eq(tillyReminders.status, "scheduled"),
                  sql`${tillyReminders.fireAt} BETWEEN ${winStart.toISOString()} AND ${winEnd.toISOString()}`,
                ),
              )
              .limit(20);
            const fuzzyMatch = existing.find((r) =>
              isReminderDuplicate(r.label, draft.label),
            );
            if (fuzzyMatch) {
              console.log(
                `[reminder] dedup hit — skipping insert. New="${draft.label}", existing="${fuzzyMatch.label}" (id=${fuzzyMatch.id})`,
              );
            } else {
              const [remRow] = await db
                .insert(tillyReminders)
                .values({
                  userId,
                  householdId,
                  kind: draft.kind,
                  label: draft.label,
                  fireAt: draft.fireAt,
                })
                .returning();
              createdReminder = {
                id: remRow.id,
                label: remRow.label,
                kind: remRow.kind,
                fireAt: remRow.fireAt.toISOString(),
              };
              emitEventAsync({
                userId,
                householdId,
                kind: "reminder_created",
                payload: {
                  label: draft.label,
                  kind: draft.kind,
                  fireAt: draft.fireAt.toISOString(),
                  triggeredByMessage: message,
                },
                sourceTable: "tilly_reminders",
                sourceId: remRow.id,
              });
              // S4 — A Tilly-promised reminder is an
              // implementation_intention nudge ("when X happens, do Y").
              // Outcome resolves either by user cancel (dismissed), by
              // reminder fire + user action (accepted), or by sweeper
              // after the fire window passes (ignored).
              await recordNudgeSent({
                userId,
                householdId,
                frame: "implementation_intention",
                channel: "chat_inline",
                body: draft.label,
                context: {
                  kind: draft.kind,
                  fireAt: draft.fireAt.toISOString(),
                  triggeredByMessage: message.slice(0, 200),
                },
                sourceTable: "tilly_reminders",
                sourceId: remRow.id,
              });
            }
          }
        } catch (err) {
          console.warn("[chat] reminder persist failed:", err);
        }

        const [tillyRow] = await db
          .insert(guardianConversations)
          .values({
            coupleId: householdId,
            userId,
            role: "guardian",
            content: text,
            intent: "chat",
          })
          .returning();
        reply = {
          id: tillyRow.id,
          role: "tilly",
          kind: "text",
          body: text,
          createdAt: tillyRow.createdAt.toISOString(),
        };
        emitEventAsync({
          userId,
          householdId,
          kind: "chat_tilly_reply",
          payload: {
            kind: "text",
            body: text,
            inReplyTo: userRow.id,
          },
          sourceTable: "guardian_conversations",
          sourceId: tillyRow.id,
        });
      }

      // 3. Memory extraction — fire & forget. Do NOT await. Failures are logged
      // inside extractMemories; we never block a chat reply on memory writes.
      const exchangeBody = `USER: ${message}\nTILLY: ${
        reply.kind === "analysis" ? reply.note : reply.body
      }`;
      void (async () => {
        try {
          const drafts = await extractMemories({
            userId,
            householdId,
            source: "chat",
            conversationId: userRow.id,
            body: exchangeBody,
            tone,
            now: new Date().toISOString(),
          });
          if (drafts.length) {
            // Compute embeddings BEFORE the transaction so RAG can find these
            // memories on the next chat turn. embed() returns null on failure
            // — we still save the memory, just without an embedding (the
            // retriever will fall back to recency for those rows).
            const embeddings = await Promise.all(drafts.map((d) => embed(d.body)));

            await db.transaction(async (tx) => {
              await tx
                .update(tillyMemory)
                .set({ isMostRecent: false })
                .where(
                  and(
                    eq(tillyMemory.userId, userId),
                    eq(tillyMemory.isMostRecent, true),
                  ),
                );
              for (let i = 0; i < drafts.length; i++) {
                const d = drafts[i];
                await tx.insert(tillyMemory).values({
                  userId,
                  householdId,
                  kind: d.kind,
                  body: d.body,
                  source: "chat",
                  category: d.category ?? undefined,
                  conversationId: userRow.id,
                  dateLabel: d.dateLabel,
                  // Most recently extracted memory of this batch carries the dot.
                  isMostRecent: i === 0,
                  embedding: embeddings[i] ?? undefined,
                });
              }
            });
          }
        } catch (err) {
          console.error("memory write failed (non-fatal):", err);
        }
      })();

      res.json({ reply, createdReminder });
    } catch (err: any) {
      console.error("/api/tilly/chat error:", err);
      res.status(500).json({ error: "chat failed" });
    }
  });

  // GET /api/tilly/chat/history — full conversation history for this user's household.
  app.get("/api/tilly/chat/history", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ messages: [] });

    try {
      // Most-recent 200 messages, then reverse to chronological. The
      // previous ASC-LIMIT-200 returned the OLDEST 200 — for an active
      // user that meant new turns silently disappeared from the chat
      // once they crossed the 200 threshold.
      const recent = await db
        .select()
        .from(guardianConversations)
        .where(eq(guardianConversations.coupleId, householdId))
        .orderBy(desc(guardianConversations.createdAt))
        .limit(200);
      const rows = recent.slice().reverse();

      // Pull every scout/wait job referenced by an intent row in one query
      // so the wire shape always reflects the live job status (queued ->
      // running -> done/failed) without N+1 round trips. Both 'scout' and
      // 'wait' intents share the same tilly_scout_jobs table — the row's
      // intent + the job's mode determine the rendered card shape.
      const scoutJobIds = rows
        .filter(
          (r) =>
            (r.intent === "scout" || r.intent === "wait") &&
            r.metadata &&
            typeof r.metadata === "object" &&
            "jobId" in r.metadata,
        )
        .map((r) => (r.metadata as { jobId: string }).jobId);
      const scoutById = new Map<
        string,
        typeof tillyScoutJobs.$inferSelect
      >();
      if (scoutJobIds.length) {
        const jobs = await db
          .select()
          .from(tillyScoutJobs)
          .where(inArray(tillyScoutJobs.id, scoutJobIds));
        for (const j of jobs) scoutById.set(j.id, j);
      }
      res.json({ messages: rows.map((r) => rowToWire(r, scoutById)) });
    } catch (err) {
      console.error("/api/tilly/chat/history error:", err);
      res.status(500).json({ error: "history failed" });
    }
  });

  // POST /api/tilly/chat/scout — student tapped "Find me cheaper options"
  // on an affordability analysis. Enqueues a scout job (mode='find') and
  // writes a guardian_conversations row of intent=scout so the chat
  // thread shows the scouting state inline.
  //
  // S11 — POST /api/tilly/chat/wait does the same plumbing but enqueues a
  // wait-mode job (mode='wait') and writes intent='wait', so the chat
  // history serializer renders a wait-advice card instead of an options
  // grid. Both endpoints use the same orchestrator; only the synthesis
  // head differs.
  const mountChatScoutLike = (path: string, mode: "find" | "wait") => {
    app.post(path, requireAuth, async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });

      const query = String(req.body?.query ?? "").trim();
      if (!query) return res.status(400).json({ error: "query required" });
      if (query.length > 200)
        return res.status(400).json({ error: "query too long" });
      const location =
        typeof req.body?.location === "string" && req.body.location.trim()
          ? req.body.location.trim().slice(0, 100)
          : null;
      const sourceMessageId =
        typeof req.body?.sourceMessageId === "string"
          ? req.body.sourceMessageId
          : null;

      const jobId = await enqueueScout({
        userId,
        householdId,
        query,
        location,
        mode,
      });

      // The conversation row's `intent` mirrors the job's mode, which is
      // what the history serializer reads to pick the right card shape.
      const intent = mode === "wait" ? "wait" : "scout";
      const placeholder =
        mode === "wait"
          ? `Looking up sale history for ${query}. One sec.`
          : `On it — I'll check ${query}. Give me a minute.`;
      const [convRow] = await db
        .insert(guardianConversations)
        .values({
          coupleId: householdId,
          userId,
          role: "guardian",
          content: placeholder,
          intent,
          metadata: { jobId, query, location, sourceMessageId },
        })
        .returning();

      emitEventAsync({
        userId,
        householdId,
        kind: "chat_tilly_reply",
        payload: { kind: intent, jobId, query, location, inReplyTo: sourceMessageId },
        sourceTable: "guardian_conversations",
        sourceId: convRow.id,
      });

      res.json({ jobId, messageId: convRow.id });
    });
  };
  mountChatScoutLike("/api/tilly/chat/scout", "find");
  mountChatScoutLike("/api/tilly/chat/wait", "wait");

  // S12 — POST /api/tilly/me/city. Persist the user's city so scouts
  // automatically default to local secondhand inventory. The
  // affordability/scout flow already passes location through when set; this
  // endpoint just lets the client write it once. GET is exposed for the
  // profile screen to render the current value.
  app.get(
    "/api/tilly/me/city",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const u = await db.query.users.findFirst({
        where: eq(users.id, req.user.id),
        columns: { city: true },
      });
      res.json({ city: u?.city ?? null });
    },
  );
  app.put(
    "/api/tilly/me/city",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const raw = req.body?.city;
      if (raw === null || raw === "") {
        await db.update(users).set({ city: null }).where(eq(users.id, req.user.id));
        return res.json({ city: null });
      }
      if (typeof raw !== "string" || !raw.trim()) {
        return res.status(400).json({ error: "city must be a non-empty string or null" });
      }
      const city = raw.trim().slice(0, 100);
      await db.update(users).set({ city }).where(eq(users.id, req.user.id));
      res.json({ city });
    },
  );

  // GET /api/tilly/tone — read current tone preference.
  app.get("/api/tilly/tone", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const tone = await getTone(req.user.id);
    res.json({ tone });
  });

  // PUT /api/tilly/tone — update tone (sibling | coach | quiet).
  app.put("/api/tilly/tone", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const tone = req.body?.tone;
    if (!isValidTone(tone)) {
      return res.status(400).json({ error: "tone must be sibling | coach | quiet" });
    }
    await setUserTone(req.user.id, tone);
    res.json({ tone });
  });

  // GET /api/tilly/quiet — read all quiet-settings fields the Profile
  // Quiet Settings card surfaces (hours, big-purchase threshold, sub
  // scan cadence, phishing watch, memory retention).
  app.get("/api/tilly/quiet", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const pref = await db.query.tillyTonePref.findFirst({
      where: eq(tillyTonePref.userId, userId),
    });
    res.json({
      quietHoursStart: pref?.quietHoursStart ?? "23:00",
      quietHoursEnd: pref?.quietHoursEnd ?? "07:00",
      bigPurchaseThreshold: pref?.bigPurchaseThreshold ?? 25,
      subscriptionScanCadence: pref?.subscriptionScanCadence ?? "weekly",
      phishingWatch: pref?.phishingWatch ?? true,
      memoryRetention: pref?.memoryRetention ?? "forever",
    });
  });

  // PUT /api/tilly/quiet — update one or more quiet-settings fields.
  app.put("/api/tilly/quiet", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const body = req.body ?? {};
    const set: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.quietHoursStart === "string" && /^\d{2}:\d{2}$/.test(body.quietHoursStart))
      set.quietHoursStart = body.quietHoursStart;
    if (typeof body.quietHoursEnd === "string" && /^\d{2}:\d{2}$/.test(body.quietHoursEnd))
      set.quietHoursEnd = body.quietHoursEnd;
    if (typeof body.bigPurchaseThreshold === "number" && body.bigPurchaseThreshold >= 0)
      set.bigPurchaseThreshold = body.bigPurchaseThreshold;
    if (
      typeof body.subscriptionScanCadence === "string" &&
      ["daily", "weekly", "monthly", "off"].includes(body.subscriptionScanCadence)
    )
      set.subscriptionScanCadence = body.subscriptionScanCadence;
    if (typeof body.phishingWatch === "boolean") set.phishingWatch = body.phishingWatch;
    if (
      typeof body.memoryRetention === "string" &&
      ["forever", "year", "month", "session"].includes(body.memoryRetention)
    )
      set.memoryRetention = body.memoryRetention;

    // Upsert: insert with defaults if no pref row exists, otherwise update.
    await db
      .insert(tillyTonePref)
      .values({ userId, ...(set as any) })
      .onConflictDoUpdate({ target: tillyTonePref.userId, set });

    res.json({ ok: true });
  });

  // POST /api/tilly/learned/dismiss — archive the most recent observation
  // memory ("Don't worry about it" button on the Tilly Learned card).
  app.post(
    "/api/tilly/learned/dismiss",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      try {
        const recent = await db
          .select()
          .from(tillyMemory)
          .where(
            and(
              eq(tillyMemory.userId, userId),
              eq(tillyMemory.kind, "observation"),
              sql`${tillyMemory.archivedAt} IS NULL`,
            ),
          )
          .orderBy(desc(tillyMemory.noticedAt))
          .limit(1);
        if (recent[0]) {
          await db
            .update(tillyMemory)
            .set({ archivedAt: new Date() })
            .where(eq(tillyMemory.id, recent[0].id));
        }
        if (householdId) {
          emitEventAsync({
            userId,
            householdId,
            kind: "learned_dismissed",
            payload: { observationBody: recent[0]?.body ?? null },
            sourceTable: "tilly_memory",
            sourceId: recent[0]?.id,
          });
          // S4 — close the in-app-card nudge that surfaced this
          // observation. The pattern-cron recorded it with
          // sourceTable=tilly_memory; we look it up by latest pending.
          const nudge = await findLatestPendingNudge(userId, {
            channel: "in_app_card",
          });
          if (nudge) await resolveNudge(nudge.id, "dismissed");
        }
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/tilly/learned/dismiss error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "dismiss failed", debug: msg });
      }
    },
  );

  // POST /api/tilly/learned/remind — confirm the user wants Tilly to
  // nudge them about this pattern. Writes a preference memory the chat
  // system prompt sees on every turn ("user wants Tuesday-night nudge
  // before their Wednesday soft-spot").
  app.post(
    "/api/tilly/learned/remind",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      try {
        // Find the most recent observation to anchor the preference to.
        const recent = await db
          .select()
          .from(tillyMemory)
          .where(
            and(
              eq(tillyMemory.userId, userId),
              eq(tillyMemory.kind, "observation"),
              sql`${tillyMemory.archivedAt} IS NULL`,
            ),
          )
          .orderBy(desc(tillyMemory.noticedAt))
          .limit(1);
        const obsBody = recent[0]?.body ?? "this week's pattern";

        const [memRow] = await db
          .insert(tillyMemory)
          .values({
            userId,
            householdId,
            kind: "preference",
            body: `They asked me to nudge them the night before — re: ${obsBody}`,
            source: "action",
            dateLabel: "Today",
            isMostRecent: true,
          })
          .returning();
        emitEventAsync({
          userId,
          householdId,
          kind: "learned_remind_accepted",
          payload: { observationBody: obsBody },
          sourceTable: "tilly_memory",
          sourceId: memRow.id,
        });
        // S4 — close the in-app-card nudge as accepted.
        const pendingNudge = await findLatestPendingNudge(userId, {
          channel: "in_app_card",
        });
        if (pendingNudge) await resolveNudge(pendingNudge.id, "accepted");
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/tilly/learned/remind error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "remind failed", debug: msg });
      }
    },
  );

  // GET /api/tilly/reminders — every reminder Tilly has promised this user
  // that's still scheduled (or fired in the last 7d, for context).
  app.get(
    "/api/tilly/reminders",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select()
        .from(tillyReminders)
        .where(
          and(
            eq(tillyReminders.userId, userId),
            sql`(${tillyReminders.status} = 'scheduled' OR ${tillyReminders.firedAt} > ${sevenDaysAgo.toISOString()})`,
          ),
        )
        .orderBy(asc(tillyReminders.fireAt))
        .limit(20);
      res.json({
        reminders: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind,
          fireAt: r.fireAt.toISOString(),
          status: r.status,
          firedAt: r.firedAt ? r.firedAt.toISOString() : null,
        })),
      });
    },
  );

  // GET /api/tilly/reminders/today — reminders firing today (00:00–23:59
  // local server time) plus any that fired earlier today and are still
  // unactioned. Used by the Today tab "Up next" card. Tighter than the
  // generic /reminders endpoint so the card doesn't have to filter
  // client-side.
  app.get(
    "/api/tilly/reminders/today",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      const rows = await db
        .select()
        .from(tillyReminders)
        .where(
          and(
            eq(tillyReminders.userId, userId),
            sql`${tillyReminders.status} = 'scheduled'`,
            sql`${tillyReminders.fireAt} BETWEEN ${startOfDay.toISOString()} AND ${endOfDay.toISOString()}`,
          ),
        )
        .orderBy(asc(tillyReminders.fireAt))
        .limit(10);
      res.json({
        reminders: rows.map((r) => ({
          id: r.id,
          label: r.label,
          kind: r.kind,
          fireAt: r.fireAt.toISOString(),
          status: r.status,
        })),
      });
    },
  );

  // POST /api/tilly/reminders/:id/done — mark a reminder complete. Used
  // by the Today "Up next" tap-to-mark-done. Idempotent.
  app.post(
    "/api/tilly/reminders/:id/done",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const id = String(req.params.id);
      await db
        .update(tillyReminders)
        .set({ status: "fired", firedAt: new Date() })
        .where(
          and(eq(tillyReminders.id, id), eq(tillyReminders.userId, userId)),
        );
      const householdId = req.user.coupleId;
      if (householdId) {
        emitEventAsync({
          userId,
          householdId,
          kind: "reminder_fired",
          payload: { reminderId: id, manualComplete: true },
          sourceTable: "tilly_reminders",
          sourceId: id,
        });
        // S4 — chat-inline reminder marked done counts as accepted.
        const pendingChat = await findLatestPendingNudge(userId, {
          channel: "chat_inline",
        });
        if (pendingChat && pendingChat.sourceId === id) {
          await resolveNudge(pendingChat.id, "accepted");
        }
      }
      res.json({ ok: true });
    },
  );

  // POST /api/tilly/reminders/:id/snooze — push fireAt by N minutes
  // (default 60). Returns the new fireAt so the client updates without
  // a refetch.
  app.post(
    "/api/tilly/reminders/:id/snooze",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const id = String(req.params.id);
      const minutes = Math.min(
        Math.max(Number(req.body?.minutes ?? 60), 5),
        60 * 24 * 7,
      );
      const existing = await db.query.tillyReminders.findFirst({
        where: and(eq(tillyReminders.id, id), eq(tillyReminders.userId, userId)),
      });
      if (!existing) return res.status(404).json({ error: "not_found" });
      const newFireAt = new Date(
        Math.max(existing.fireAt.getTime(), Date.now()) + minutes * 60 * 1000,
      );
      await db
        .update(tillyReminders)
        .set({ fireAt: newFireAt })
        .where(eq(tillyReminders.id, id));
      res.json({ ok: true, fireAt: newFireAt.toISOString() });
    },
  );

  // POST /api/tilly/reminders/:id/cancel — student cancels a scheduled
  // reminder. Idempotent — already-cancelled rows return ok:true.
  app.post(
    "/api/tilly/reminders/:id/cancel",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const id = String(req.params.id);
      await db
        .update(tillyReminders)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(eq(tillyReminders.id, id), eq(tillyReminders.userId, userId)),
        );
      const householdId = req.user.coupleId;
      if (householdId) {
        emitEventAsync({
          userId,
          householdId,
          kind: "reminder_cancelled",
          payload: { reminderId: id },
          sourceTable: "tilly_reminders",
          sourceId: id,
        });
        // S4 — if a reminder_fire nudge for this reminder is pending,
        // cancellation counts as dismissed. Reminders set proactively
        // via Tilly's chat are themselves nudges (channel=chat_inline),
        // mark those dismissed too.
        const pendingFire = await findLatestPendingNudge(userId, {
          channel: "reminder_fire",
        });
        if (pendingFire && pendingFire.sourceId === id) {
          await resolveNudge(pendingFire.id, "dismissed");
        }
        const pendingChat = await findLatestPendingNudge(userId, {
          channel: "chat_inline",
        });
        if (pendingChat && pendingChat.sourceId === id) {
          await resolveNudge(pendingChat.id, "dismissed");
        }
      }
      res.json({ ok: true });
    },
  );

  // Tiny debug endpoint used by the e2e scenario 07. Returns the count of
  // event-log rows for the authenticated user. Not security-sensitive
  // (a count, scoped to the caller) but limited to non-prod auditing.
  app.get(
    "/api/tilly/_debug/event-count",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tillyEvents)
        .where(eq(tillyEvents.userId, userId));
      res.json({ count: rows[0]?.count ?? 0 });
    },
  );

  // S2 — manually trigger the nightly distiller for the authed user, over
  // a configurable lookback window. Used by e2e scenario 08 to verify
  // memories actually land. Body: { hours?: number } (default 168 = 7d).
  app.post(
    "/api/tilly/_debug/distill-now",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const hours = Number(req.body?.hours ?? 168);
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const r = await distillUser({ userId, householdId, since });
      res.json(r);
    },
  );

  // S2 — list the latest typed memories for the authed user. e2e and
  // (later) the dossier rewrite read this.
  app.get(
    "/api/tilly/_debug/typed-memory",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const limit = Math.min(Number(req.query?.limit ?? 20), 100);
      const rows = await db
        .select()
        .from(tillyMemoryV2)
        .where(eq(tillyMemoryV2.userId, userId))
        .orderBy(desc(tillyMemoryV2.createdAt))
        .limit(limit);
      res.json({
        memories: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          body: r.body,
          metadata: r.metadata,
          sourceEventIds: r.sourceEventIds,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  // S3 — manually trigger a dossier rewrite for the authed user.
  app.post(
    "/api/tilly/_debug/rewrite-dossier",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const r = await rewriteDossier({ userId });
      res.json(r);
    },
  );

  // S3 — read the latest dossier for the authed user.
  app.get(
    "/api/tilly/_debug/dossier",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const dossier = await getLatestDossier(req.user.id);
      res.json({
        dossier: dossier
          ? {
              content: dossier.content,
              memoriesConsidered: dossier.memoriesConsidered,
              generatedAt: dossier.generatedAt.toISOString(),
            }
          : null,
      });
    },
  );

  // S4 — list the recent nudge log for the authed user.
  app.get(
    "/api/tilly/_debug/nudges",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const limit = Math.min(Number(req.query?.limit ?? 20), 100);
      const rows = await db
        .select()
        .from(tillyNudges)
        .where(eq(tillyNudges.userId, userId))
        .orderBy(desc(tillyNudges.sentAt))
        .limit(limit);
      res.json({
        nudges: rows.map((r) => ({
          id: r.id,
          frame: r.frame,
          channel: r.channel,
          body: r.body,
          context: r.context,
          outcome: r.outcome,
          sentAt: r.sentAt.toISOString(),
          outcomeAt: r.outcomeAt ? r.outcomeAt.toISOString() : null,
        })),
      });
    },
  );

  // S4 — synthesize an in-app-card nudge + observation memory pair, the
  // way the weekly pattern-cron would. Lets the e2e test the
  // remind/dismiss → resolveNudge round-trip without waiting for cron.
  app.post(
    "/api/tilly/_debug/seed-pattern",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no_household" });
      const body =
        typeof req.body?.body === "string" && req.body.body.trim()
          ? req.body.body.trim()
          : "$131 spent. Wednesdays are still your soft spot.";
      const [memRow] = await db
        .insert(tillyMemory)
        .values({
          userId,
          householdId,
          kind: "observation",
          body,
          source: "inferred",
          dateLabel: "This week",
          isMostRecent: true,
        })
        .returning();
      const pick = await pickFrame(userId, {
        candidates: [
          "loss_aversion",
          "social_proof",
          "goal_gradient",
          "fresh_start",
          "implementation_intention",
          "habit_loop",
          "sdt_competence",
        ],
      });
      const nudgeId = await recordNudgeSent({
        userId,
        householdId,
        frame: pick.frame,
        channel: "in_app_card",
        body,
        context: {
          source: "debug_seed",
          banditExpected: pick.expectedAccept,
        },
        sourceTable: "tilly_memory",
        sourceId: memRow.id,
      });
      res.json({
        ok: true,
        observationId: memRow.id,
        nudgeId,
        frame: pick.frame,
        banditExpected: pick.expectedAccept,
      });
    },
  );

  // S5 — return the per-frame stats for the authed user.
  app.get(
    "/api/tilly/_debug/bandit",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const stats = await getFrameStats(req.user.id);
      res.json({
        frames: stats
          .map((s) => ({
            frame: s.frame,
            accepted: s.accepted,
            notAccepted: s.notAccepted,
            pending: s.pending,
            alpha: Number(s.alpha.toFixed(2)),
            beta: Number(s.beta.toFixed(2)),
            expectedAccept: Number(s.expectedAccept.toFixed(3)),
          }))
          .sort((a, b) => b.expectedAccept - a.expectedAccept),
      });
    },
  );

  // S5 — pick a frame right now (used by admin/test). Body: { candidates? }.
  app.post(
    "/api/tilly/_debug/pick-frame",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const candidates = Array.isArray(req.body?.candidates)
        ? req.body.candidates
        : undefined;
      const pick = await pickFrame(req.user.id, { candidates });
      res.json(pick);
    },
  );
}
