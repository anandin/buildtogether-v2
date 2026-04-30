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
import { eq, and, desc, asc, sql } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import {
  guardianConversations,
  tillyTonePref,
  tillyMemory,
  tillyReminders,
  tillyEvents,
  tillyMemoryV2,
} from "../../../shared/schema";
import { distillUser } from "../../tilly/nightly-distiller";
import {
  rewriteDossier,
  getLatestDossier,
  formatDossierForPrompt,
  DossierContentSchema,
} from "../../tilly/dossier-rewriter";
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

      res.json({ reply });
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
}
