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
import { tillyConfig, tillyMemory } from "../../shared/schema";
import {
  getTillyConfig,
  invalidateLLMCache,
  OpenRouterLLM,
} from "../tilly/llm";
import { embed } from "../tilly/embeddings";
import { buildSystemPrompts } from "../tilly/persona";
import { isValidTone, type BTToneKey } from "../tilly/tone";

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
  // Quick "am I admin?" check for the page bootstrap.
  app.get(
    "/api/admin/tilly/whoami",
    requireAuth,
    async (req: Request, res: Response) => {
      // requireAdmin not used here so the page can show a sensible error
      // when a non-admin tries to load /admin/tilly.
      const u = await db.query.users.findFirst({
        where: eq(req.user!.id ? (req.user!.id as any) : ("" as any), req.user!.id),
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
          const v = await embed(r.body);
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
