/**
 * Admin memory inspector API. Backs /admin/memory.
 *
 * Endpoints (all gated by requireAuth + requireAdmin):
 *   GET /api/admin/memory/users
 *     -> [{ id, email, name, totalEvents, lastEventAt }]
 *   GET /api/admin/memory/users/:id
 *     -> { user, counts:{events,typedMemories,nudges,dossiers}, dossier }
 *   GET /api/admin/memory/users/:id/events?limit&offset
 *   GET /api/admin/memory/users/:id/typed-memory?limit&offset&kind
 *   GET /api/admin/memory/users/:id/nudges?limit&offset
 *   GET /api/admin/memory/users/:id/bandit
 *
 * Read-only — the inspector never writes through these.
 */
import type { Express, Request, Response } from "express";
import { eq, desc, sql, and } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { db } from "../db";
import {
  users,
  tillyEvents,
  tillyMemoryV2,
  tillyDossiers,
  tillyNudges,
} from "../../shared/schema";
import { getFrameStats } from "../tilly/frame-bandit";

export function mountAdminMemoryRoutes(app: Express): void {
  // List users with rough activity stats. Sorted by most recent activity.
  app.get(
    "/api/admin/memory/users",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      // Aggregate per-user from tilly_events for activity ordering.
      // LEFT JOIN onto users so admins with zero events still show up.
      const rows = await db.execute<{
        id: string;
        email: string | null;
        name: string | null;
        is_admin: boolean;
        total_events: number | null;
        last_event_at: Date | null;
      }>(sql`
        SELECT
          u.id,
          u.email,
          u.name,
          u.is_admin,
          COALESCE(e.total_events, 0)::int AS total_events,
          e.last_event_at
        FROM users u
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS total_events, MAX(ts) AS last_event_at
          FROM tilly_events
          GROUP BY user_id
        ) e ON e.user_id = u.id
        ORDER BY e.last_event_at DESC NULLS LAST, u.email ASC
        LIMIT 200
      `);
      // Drizzle's execute returns the result array directly on Neon; some
      // adapters wrap it in {rows}. Normalize.
      const list = Array.isArray(rows)
        ? rows
        : ((rows as any).rows ?? []);
      res.json({
        users: list.map((r: any) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          isAdmin: r.is_admin === true || r.is_admin === "t",
          totalEvents: Number(r.total_events ?? 0),
          lastEventAt: r.last_event_at
            ? new Date(r.last_event_at).toISOString()
            : null,
        })),
      });
    },
  );

  // User snapshot — counts + latest dossier in one call.
  app.get(
    "/api/admin/memory/users/:id",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const userRow = await db.query.users.findFirst({
        where: eq(users.id, id),
        columns: { id: true, email: true, name: true, isAdmin: true, createdAt: true },
      });
      if (!userRow) return res.status(404).json({ error: "user_not_found" });

      const [
        eventCountRow,
        memoryCountRow,
        nudgeCountRow,
        dossierCountRow,
        latestDossier,
      ] = await Promise.all([
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(tillyEvents)
          .where(eq(tillyEvents.userId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(tillyMemoryV2)
          .where(eq(tillyMemoryV2.userId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(tillyNudges)
          .where(eq(tillyNudges.userId, id)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(tillyDossiers)
          .where(eq(tillyDossiers.userId, id)),
        db
          .select()
          .from(tillyDossiers)
          .where(eq(tillyDossiers.userId, id))
          .orderBy(desc(tillyDossiers.generatedAt))
          .limit(1),
      ]);

      res.json({
        user: {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          isAdmin: userRow.isAdmin,
          createdAt: userRow.createdAt.toISOString(),
        },
        counts: {
          events: eventCountRow[0]?.c ?? 0,
          typedMemories: memoryCountRow[0]?.c ?? 0,
          nudges: nudgeCountRow[0]?.c ?? 0,
          dossiers: dossierCountRow[0]?.c ?? 0,
        },
        dossier: latestDossier[0]
          ? {
              content: latestDossier[0].content,
              memoriesConsidered: latestDossier[0].memoriesConsidered,
              generatedAt: latestDossier[0].generatedAt.toISOString(),
            }
          : null,
      });
    },
  );

  app.get(
    "/api/admin/memory/users/:id/events",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const limit = Math.min(Number(req.query?.limit ?? 100), 500);
      const offset = Math.max(Number(req.query?.offset ?? 0), 0);
      const rows = await db
        .select()
        .from(tillyEvents)
        .where(eq(tillyEvents.userId, id))
        .orderBy(desc(tillyEvents.ts))
        .limit(limit)
        .offset(offset);
      res.json({
        events: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          ts: r.ts.toISOString(),
          payload: r.payload,
          sourceTable: r.sourceTable,
          sourceId: r.sourceId,
        })),
      });
    },
  );

  app.get(
    "/api/admin/memory/users/:id/typed-memory",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const limit = Math.min(Number(req.query?.limit ?? 100), 500);
      const offset = Math.max(Number(req.query?.offset ?? 0), 0);
      const kind = typeof req.query?.kind === "string" ? req.query.kind : null;
      const conds = [eq(tillyMemoryV2.userId, id)];
      if (kind) conds.push(eq(tillyMemoryV2.kind, kind));
      const rows = await db
        .select()
        .from(tillyMemoryV2)
        .where(and(...conds))
        .orderBy(desc(tillyMemoryV2.createdAt))
        .limit(limit)
        .offset(offset);
      res.json({
        memories: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          body: r.body,
          metadata: r.metadata,
          sourceEventIds: r.sourceEventIds,
          createdAt: r.createdAt.toISOString(),
          validFrom: r.validFrom.toISOString(),
          validTo: r.validTo ? r.validTo.toISOString() : null,
        })),
      });
    },
  );

  app.get(
    "/api/admin/memory/users/:id/nudges",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const limit = Math.min(Number(req.query?.limit ?? 100), 500);
      const offset = Math.max(Number(req.query?.offset ?? 0), 0);
      const rows = await db
        .select()
        .from(tillyNudges)
        .where(eq(tillyNudges.userId, id))
        .orderBy(desc(tillyNudges.sentAt))
        .limit(limit)
        .offset(offset);
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
          outcomeEventId: r.outcomeEventId,
          sourceTable: r.sourceTable,
          sourceId: r.sourceId,
        })),
      });
    },
  );

  app.get(
    "/api/admin/memory/users/:id/bandit",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const stats = await getFrameStats(id);
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
}
