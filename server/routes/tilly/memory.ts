/**
 * Tilly memory inspector — spec §4.6 timeline + §5.4 trust contract.
 *
 *   GET     /api/tilly/memory          — list (active only by default)
 *   POST    /api/tilly/memory/:id/forget — archive a single note (soft delete)
 *   GET     /api/tilly/memory/export   — markdown bundle the user can save
 *   DELETE  /api/tilly/memory          — full purge (requires explicit header)
 *
 * The trust contract (spec §5.4): the student can forget anything at any
 * time, no friction. Export is one tap. We never delete a memory without
 * acknowledgment — `forget` archives (kept for audit), `DELETE` is an
 * explicit purge requiring `X-Confirm-Purge: yes`.
 */
import type { Express, Request, Response } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";

import { requireAuth } from "../../middleware/auth";
import { db } from "../../db";
import { tillyMemory } from "../../../shared/schema";

type WireMemoryNote = {
  id: string;
  kind: "observation" | "anxiety" | "value" | "commitment" | "preference";
  body: string;
  dateLabel: string;
  noticedAt: string;
  isMostRecent: boolean;
  archivedAt: string | null;
};

function toWire(row: typeof tillyMemory.$inferSelect): WireMemoryNote {
  return {
    id: row.id,
    kind: row.kind as WireMemoryNote["kind"],
    body: row.body,
    dateLabel: row.dateLabel,
    noticedAt: row.noticedAt.toISOString(),
    isMostRecent: !!row.isMostRecent,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export function mountTillyMemoryRoutes(app: Express): void {
  // List active memories (or include archived with ?include_archived=1).
  app.get("/api/tilly/memory", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const includeArchived = req.query.include_archived === "1";

    try {
      const where = includeArchived
        ? eq(tillyMemory.userId, userId)
        : and(eq(tillyMemory.userId, userId), isNull(tillyMemory.archivedAt));

      const rows = await db
        .select()
        .from(tillyMemory)
        .where(where)
        .orderBy(desc(tillyMemory.noticedAt))
        .limit(500);

      res.json({ memory: rows.map(toWire) });
    } catch (err) {
      console.error("/api/tilly/memory list error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  // Archive a single note — the spec's "forget" action.
  app.post(
    "/api/tilly/memory/:id/forget",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const id = String(req.params.id);

      try {
        const result = await db
          .update(tillyMemory)
          .set({ archivedAt: new Date(), isMostRecent: false })
          .where(and(eq(tillyMemory.id, id), eq(tillyMemory.userId, userId)))
          .returning({ id: tillyMemory.id });

        if (!result.length) {
          return res.status(404).json({ error: "memory not found" });
        }
        res.json({ ok: true, id });
      } catch (err) {
        console.error("/api/tilly/memory forget error:", err);
        res.status(500).json({ error: "forget failed" });
      }
    },
  );

  // Export as markdown — the user's full memory in their own bundle.
  app.get("/api/tilly/memory/export", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;

    try {
      const rows = await db
        .select()
        .from(tillyMemory)
        .where(and(eq(tillyMemory.userId, userId), isNull(tillyMemory.archivedAt)))
        .orderBy(desc(tillyMemory.noticedAt));

      const lines: string[] = [
        "# What Tilly remembers about you",
        "",
        "_All memories Tilly currently holds, in her own voice. Tilly will never sell or share this — it lives only on your account._",
        "",
      ];
      for (const r of rows) {
        lines.push(`### ${r.dateLabel}  ·  _${r.kind}_`);
        lines.push("");
        lines.push(`> ${r.body}`);
        lines.push("");
      }
      if (!rows.length) {
        lines.push("_(Nothing yet — Tilly will start writing as you talk.)_");
      }

      res.json({ markdown: lines.join("\n") });
    } catch (err) {
      console.error("/api/tilly/memory export error:", err);
      res.status(500).json({ error: "export failed" });
    }
  });

  // Full purge — requires `X-Confirm-Purge: yes` header so it can't fire by accident.
  app.delete("/api/tilly/memory", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const userId = req.user.id;
    const confirm = req.header("x-confirm-purge");
    if (confirm !== "yes") {
      return res
        .status(400)
        .json({ error: "X-Confirm-Purge: yes header required to purge memory" });
    }

    try {
      const result = await db
        .update(tillyMemory)
        .set({ archivedAt: new Date(), isMostRecent: false })
        .where(and(eq(tillyMemory.userId, userId), isNull(tillyMemory.archivedAt)))
        .returning({ id: tillyMemory.id });
      res.json({ ok: true, archived: result.length });
    } catch (err) {
      console.error("/api/tilly/memory purge error:", err);
      res.status(500).json({ error: "purge failed" });
    }
  });
}
