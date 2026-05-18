/**
 * Admin Tilly tuning endpoints — feeds /admin/tilly.
 *
 *   GET  /api/admin/tilly/config       — read singleton
 *   PUT  /api/admin/tilly/config       — partial update + cache invalidation
 *   POST /api/admin/tilly/preview      — run a one-shot Tilly chat with a
 *                                        provisional config (no save)
 *   GET  /api/admin/tilly/whoami       — debug: who am I, am I admin?
 *   POST /api/admin/tilly/reembed      — recompute embeddings for all memory
 *                                        rows (use after switching embedding model)
 *
 * All endpoints require requireAuth + requireAdmin.
 */
import type { Express, Request, Response } from "express";
import { eq, isNull, isNotNull, and } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { db } from "../db";
import { tillyConfig, users } from "../../shared/schema";
import {
  getTillyConfig,
  invalidateLLMCache,
  OpenRouterLLM,
} from "../tilly/llm";
import { embed } from "../tilly/embeddings";
import { buildSystemPrompts } from "../tilly/persona";
import { isValidTone, type BTToneKey, DEFAULT_TONE } from "../tilly/tone";
import {
  getLatestDossier,
  formatDossierForPrompt,
  DossierContentSchema,
} from "../tilly/dossier-rewriter";
import { hybridRetrieve } from "../tilly/retriever";
import { tillyTonePref, tillyMemory } from "../../shared/schema";
import { buildFinancialStateSummary } from "../tilly/state-summary";
// (`tillyConfig` is also imported above; we add `tillyMemory` here next to
// the other tilly memory/dossier helpers so the user-context endpoint can
// hydrate retrieval log rows into bodies.)
import { getLatestRetrieval } from "../tilly/retrieval-log";
import { inArray } from "drizzle-orm";

const ALLOWED_FIELDS = [
  "provider",
  "model",
  "embeddingModel",
  "maxTokens",
  "retrievalTopK",
  "similarityThreshold",
  "retrievalStrategy",
  "recencyHalfLifeHours",
  "personaPromptOverride",
  "toneSiblingOverride",
  "toneCoachOverride",
  "toneQuietOverride",
] as const;

function pickAllowed(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  return out;
}

export function mountAdminTillyRoutes(app: Express): void {
  // Per-process detector failure counters (audit fix #3). Surfaced
  // here so silent detector throws stop hiding. Resets on cold start;
  // when we have real observability infra these move to Sentry.
  app.get(
    "/api/admin/tilly/detector-health",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      const { getDetectorFailureCounters } = await import("../tilly/detectors");
      const failures = getDetectorFailureCounters();
      const totalFailures = Object.values(failures).reduce((s, v) => s + v, 0);
      res.json({
        totalFailuresThisProcess: totalFailures,
        perDetector: failures,
        note:
          "Counters reset on cold-start. A non-zero count means a detector threw — check Vercel logs for the stack.",
      });
    },
  );

  // Quick "am I admin?" check for the page bootstrap.
  app.get(
    "/api/admin/tilly/whoami",
    requireAuth,
    async (req: Request, res: Response) => {
      // requireAdmin not used here so the page can show a sensible error
      // when a non-admin tries to load /admin/tilly.
      const u = await db.query.users.findFirst({
        where: eq(users.id, req.user!.id),
        columns: { id: true, email: true, name: true, isAdmin: true },
      });
      res.json({ user: u ?? null, ok: !!u?.isAdmin });
    },
  );

  // Read.
  app.get(
    "/api/admin/tilly/config",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const config = await getTillyConfig();
        res.json({ config });
      } catch (err) {
        console.error("/api/admin/tilly/config GET error:", err);
        res.status(500).json({ error: "config read failed" });
      }
    },
  );

  // Update.
  app.put(
    "/api/admin/tilly/config",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const updates = pickAllowed(req.body ?? {});
        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: "no allowed fields in body" });
        }
        // Coerce numbers from form strings.
        for (const k of [
          "maxTokens",
          "retrievalTopK",
        ] as const) {
          if (k in updates) updates[k] = Number(updates[k]);
        }
        for (const k of [
          "similarityThreshold",
          "recencyHalfLifeHours",
        ] as const) {
          if (k in updates) updates[k] = Number(updates[k]);
        }

        await db
          .update(tillyConfig)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(tillyConfig.id, "default"));

        invalidateLLMCache();
        const config = await getTillyConfig();
        res.json({ config });
      } catch (err) {
        console.error("/api/admin/tilly/config PUT error:", err);
        res.status(500).json({ error: "config write failed" });
      }
    },
  );

  // Preview — try an LLM call with the saved config, without committing
  // any chat or memory side-effects.
  app.post(
    "/api/admin/tilly/preview",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const tone: BTToneKey =
        typeof req.body?.tone === "string" && isValidTone(req.body.tone)
          ? req.body.tone
          : "sibling";
      const message =
        typeof req.body?.message === "string"
          ? req.body.message.trim()
          : "Quick test — say hi in your current voice.";
      try {
        const config = await getTillyConfig();
        const llm = new OpenRouterLLM(config.model);
        const systemPrompts = await buildSystemPrompts(tone);
        const result = await llm.textReply({
          systemPrompts,
          messages: [{ role: "user", content: message }],
          maxTokens: 1024,
          meta: { userId: req.user?.id ?? null, route: "preview" },
        });
        res.json({ reply: result.text, usage: result.usage, model: result.modelId });
      } catch (err: any) {
        console.error("/api/admin/tilly/preview error:", err);
        res
          .status(500)
          .json({ error: err?.message ?? "preview failed", code: "preview_error" });
      }
    },
  );

  // Re-embed all active memories — useful after swapping the embedding model.
  app.post(
    "/api/admin/tilly/reembed",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const rows = await db
          .select()
          .from(tillyMemory)
          .where(isNull(tillyMemory.archivedAt))
          .limit(2000);

        let updated = 0;
        for (const r of rows) {
          const v = await embed(r.body, { userId: r.userId ?? null, route: "reembed" });
          if (!v) continue;
          await db
            .update(tillyMemory)
            .set({ embedding: v })
            .where(eq(tillyMemory.id, r.id));
          updated++;
        }
        res.json({ scanned: rows.length, updated });
      } catch (err) {
        console.error("/api/admin/tilly/reembed error:", err);
        res.status(500).json({ error: "reembed failed" });
      }
    },
  );

  // System prompt preview — assembles the exact stack Tilly would see for
  // this user's next chat turn (persona + tone + dossier + retrieved
  // memories). Read-only; no LLM call. Drives the admin transparency
  // surface ("here is the prompt that just went to Tilly").
  app.get(
    "/api/admin/tilly/system-prompt-preview",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const userId = typeof req.query?.userId === "string" ? req.query.userId : null;
        const probeMessage =
          typeof req.query?.message === "string" && req.query.message.trim()
            ? String(req.query.message).trim()
            : "money flow check-in";

        let tone: BTToneKey = DEFAULT_TONE;
        const sections: string[] = [];
        let retrievedCount = 0;
        let dossierPresent = false;

        if (userId) {
          const tonePref = await db.query.tillyTonePref.findFirst({
            where: eq(tillyTonePref.userId, userId),
          });
          if (tonePref && isValidTone(tonePref.tone)) tone = tonePref.tone;

          const [dossier, retrieved] = await Promise.all([
            getLatestDossier(userId),
            hybridRetrieve(userId, probeMessage),
          ]);
          if (dossier) {
            const parsed = DossierContentSchema.safeParse(dossier.content);
            if (parsed.success) {
              dossierPresent = true;
              sections.push(formatDossierForPrompt(parsed.data));
            }
          }
          if (retrieved.length) {
            retrievedCount = retrieved.length;
            sections.push(
              `What you remember about them (in your voice, from RAG):\n${retrieved
                .map((m) => `- [${m.kind}, ${m.dateLabel}] ${m.body}`)
                .join("\n")}`,
            );
          }
        }

        const systemPrompts = await buildSystemPrompts(tone, sections);
        res.json({
          tone,
          dossierPresent,
          retrievedCount,
          systemPrompts,
          totalChars: systemPrompts.reduce((s, p) => s + p.length, 0),
        });
      } catch (err) {
        console.error("/api/admin/tilly/system-prompt-preview error:", err);
        res.status(500).json({ error: "preview failed" });
      }
    },
  );

  // User context dump — the actual current dossier JSON + the actual
  // injected system prompt block + the most recent chat retrieval AND
  // the most recent analysis retrieval (separately) for one user. This
  // is the "what is Tilly seeing right now for this user" surface that
  // backs the /admin/tilly transparency panel. Read-only; no LLM call.
  app.get(
    "/api/admin/tilly/user-context",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const userId = typeof req.query?.userId === "string" ? req.query.userId : null;
        if (!userId) return res.status(400).json({ error: "userId required" });

        let tone: BTToneKey = DEFAULT_TONE;
        const tonePref = await db.query.tillyTonePref.findFirst({
          where: eq(tillyTonePref.userId, userId),
        });
        if (tonePref && isValidTone(tonePref.tone)) tone = tonePref.tone;

        // Resolve coupleId so we can rebuild the same financial state
        // summary chat injects. Without this the admin preview would
        // show *less* than what Tilly actually sees at runtime.
        const userRow = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });
        const householdId = userRow?.coupleId ?? null;

        const [dossier, lastChat, lastAnalysis, state] = await Promise.all([
          getLatestDossier(userId),
          getLatestRetrieval(userId, "chat"),
          getLatestRetrieval(userId, "analysis"),
          householdId ? buildFinancialStateSummary(householdId) : Promise.resolve({ hasData: false, text: "" }),
        ]);

        const sections: string[] = [];
        let dossierJson: unknown = null;
        if (dossier) {
          const parsed = DossierContentSchema.safeParse(dossier.content);
          if (parsed.success) {
            dossierJson = parsed.data;
            sections.push(formatDossierForPrompt(parsed.data));
          }
        }
        // Mirror chat.ts: financial state block goes in second.
        if (state.hasData) {
          sections.push(
            `Their current state — use this when they ask about money:\n${state.text}\n\nDO NOT say you can't see their balance or that you need them to connect; the data above is your access. If a specific thing isn't listed (e.g. credit utilization), say you don't see THAT specific thing yet.`,
          );
        }
        // Mirror chat.ts: if there's a recent chat retrieval, render
        // its hits as the "What you remember" block. This is the
        // closest faithful reconstruction of the prompt Tilly saw on
        // the last chat turn — same memories, same ordering.
        const lastChatHits =
          lastChat && Array.isArray(lastChat.memoryIds) && (lastChat.memoryIds as string[]).length
            ? await db
                .select({
                  id: tillyMemory.id,
                  kind: tillyMemory.kind,
                  body: tillyMemory.body,
                  dateLabel: tillyMemory.dateLabel,
                })
                .from(tillyMemory)
                .where(inArray(tillyMemory.id, lastChat.memoryIds as string[]))
            : [];
        if (lastChatHits.length) {
          // Preserve the original ordering from the retrieval log.
          const byId = new Map(lastChatHits.map((m) => [m.id, m]));
          const ordered = (lastChat!.memoryIds as string[])
            .map((mid) => byId.get(mid))
            .filter((m): m is NonNullable<typeof m> => !!m);
          sections.push(
            `What you remember about them (in your voice, from RAG):\n${ordered
              .map((m) => `- [${m.kind}, ${m.dateLabel}] ${m.body}`)
              .join("\n")}`,
          );
        }
        const systemPrompts = await buildSystemPrompts(tone, sections);

        // Helper — hydrate a retrieval log into {hits} with body+score.
        const hydrate = async (
          log: Awaited<ReturnType<typeof getLatestRetrieval>>,
        ) => {
          if (!log) return null;
          const memIds = Array.isArray(log.memoryIds) ? (log.memoryIds as string[]) : [];
          const scores = Array.isArray(log.scores) ? (log.scores as number[]) : [];
          let bodies: { id: string; kind: string; body: string; dateLabel: string }[] = [];
          if (memIds.length) {
            const rows = await db
              .select({
                id: tillyMemory.id,
                kind: tillyMemory.kind,
                body: tillyMemory.body,
                dateLabel: tillyMemory.dateLabel,
              })
              .from(tillyMemory)
              .where(inArray(tillyMemory.id, memIds));
            const byId = new Map(rows.map((r) => [r.id, r]));
            bodies = memIds
              .map((mid) => byId.get(mid))
              .filter((r): r is NonNullable<typeof r> => !!r);
          }
          return {
            id: log.id,
            kind: log.kind,
            strategy: log.strategy,
            promptSize: log.promptSize,
            createdAt: log.createdAt.toISOString(),
            hits: bodies.map((m, i) => ({
              id: m.id,
              kind: m.kind,
              body: m.body,
              dateLabel: m.dateLabel,
              score: scores[i] ?? null,
            })),
          };
        };

        res.json({
          tone,
          dossier: dossier
            ? {
                content: dossierJson,
                generatedAt: dossier.generatedAt.toISOString(),
                memoriesConsidered: dossier.memoriesConsidered,
              }
            : null,
          systemPrompts,
          totalChars: systemPrompts.reduce((s, p) => s + p.length, 0),
          lastChatRetrieval: await hydrate(lastChat),
          lastAnalysisRetrieval: await hydrate(lastAnalysis),
        });
      } catch (err) {
        console.error("/api/admin/tilly/user-context error:", err);
        res.status(500).json({ error: "user context failed" });
      }
    },
  );

  // Memory stats — count by kind, total embeddings filled, etc.
  app.get(
    "/api/admin/tilly/memory-stats",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const allRows = await db.select().from(tillyMemory).limit(5000);
        const byKind: Record<string, number> = {};
        let withEmbedding = 0;
        let archived = 0;
        for (const r of allRows) {
          byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
          if (r.embedding && r.embedding.length > 0) withEmbedding++;
          if (r.archivedAt) archived++;
        }
        res.json({
          total: allRows.length,
          active: allRows.length - archived,
          archived,
          withEmbedding,
          byKind,
        });
      } catch (err) {
        console.error("/api/admin/tilly/memory-stats error:", err);
        res.status(500).json({ error: "stats failed" });
      }
    },
  );
}
