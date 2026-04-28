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
import { eq, and, desc, asc } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import {
  guardianConversations,
  tillyTonePref,
  tillyMemory,
} from "../../../shared/schema";
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
      createdAt: string;
    };

function rowToWire(row: typeof guardianConversations.$inferSelect): WireMessage {
  const role = row.role === "user" ? "user" : "tilly";
  // We store analysis cards as role="guardian" with intent="analysis" + the
  // structured payload in metadata. Plain text uses content directly.
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
    };
    return {
      id: row.id,
      role: "tilly",
      kind: "analysis",
      title: m.title,
      rows: m.rows,
      note: m.note,
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

      // 2. Generate reply
      let reply: WireMessage;
      let analysisPayload: AffordabilityAnalysis | null = null;

      if (isAffordabilityQuestion(message)) {
        try {
          // Phase 2 ledger: empty placeholder. Phase 4 wires real Plaid data —
          // until then Claude will compute against whatever's provided and
          // explain what it doesn't know.
          analysisPayload = await analyzeAffordability({
            userMessage: message,
            ledger: {
              balance: 0,
              upcomingBills: [],
              activeDreamAutoSaves: [],
            },
            tone,
            recentMemorySnippets: await retrieveContextSnippets(userId, message),
          });
        } catch (err) {
          // Fall through to plain text on parse/model errors.
          console.error("analyzeAffordability failed, falling back to text:", err);
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
          createdAt: tillyRow.createdAt.toISOString(),
        };
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

        const memSnippets = await retrieveContextSnippets(userId, message);
        const extraSystem = memSnippets.length
          ? `What you remember about them (in your voice, from RAG):\n${memSnippets.map((s) => `- ${s}`).join("\n")}`
          : undefined;

        const response = await callTilly({
          toneKey: tone,
          messages: history,
          extraSystem,
        });
        const text = response.text;

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

      res.json({ reply });
    } catch (err: any) {
      console.error("/api/tilly/chat error:", err);
      // Surface the underlying error so we can diagnose production issues
      // without needing to attach a debugger. This is intentionally
      // permissive — the message is shown to authenticated users only.
      res.status(500).json({
        error: "chat failed",
        debug: err?.message ?? String(err),
        stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
      });
    }
  });

  // GET /api/tilly/chat/history — full conversation history for this user's household.
  app.get("/api/tilly/chat/history", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ messages: [] });

    try {
      const rows = await db
        .select()
        .from(guardianConversations)
        .where(eq(guardianConversations.coupleId, householdId))
        .orderBy(asc(guardianConversations.createdAt))
        .limit(200);
      res.json({ messages: rows.map(rowToWire) });
    } catch (err) {
      console.error("/api/tilly/chat/history error:", err);
      res.status(500).json({ error: "history failed" });
    }
  });

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
}
