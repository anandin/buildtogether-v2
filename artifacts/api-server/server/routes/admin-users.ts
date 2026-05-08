/**
 * Admin Users API — feeds the /admin People tab.
 *
 *   GET  /api/admin/users
 *     → list every user with isAdmin, createdAt, lastEventAt
 *   POST /api/admin/users/:id/admin  body { isAdmin: bool }
 *     → flip isAdmin. Self-demotion is allowed but the UI warns.
 */
import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../db";
import { users, tillyLlmCallLog, guardianConversations } from "../../shared/schema";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

export function mountAdminUsersRoutes(app: Express): void {
  app.get(
    "/api/admin/users",
    requireAuth,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        // Last event = most recent of (last LLM call, last chat msg).
        // Subquery builds a per-user max(createdAt) from each surface.
        const lastLlm = db
          .select({
            userId: tillyLlmCallLog.userId,
            ts: sql<Date>`max(${tillyLlmCallLog.createdAt})`.as("ts"),
          })
          .from(tillyLlmCallLog)
          .groupBy(tillyLlmCallLog.userId)
          .as("lastLlm");

        const lastChat = db
          .select({
            userId: guardianConversations.userId,
            ts: sql<Date>`max(${guardianConversations.createdAt})`.as("ts"),
          })
          .from(guardianConversations)
          .groupBy(guardianConversations.userId)
          .as("lastChat");

        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            isAdmin: users.isAdmin,
            createdAt: users.createdAt,
            coupleId: users.coupleId,
            lastLlmAt: lastLlm.ts,
            lastChatAt: lastChat.ts,
          })
          .from(users)
          .leftJoin(lastLlm, eq(lastLlm.userId, users.id))
          .leftJoin(lastChat, eq(lastChat.userId, users.id))
          .orderBy(desc(users.createdAt))
          .limit(500);

        const shaped = rows.map((r) => {
          const llmTs = r.lastLlmAt ? new Date(r.lastLlmAt).getTime() : 0;
          const chatTs = r.lastChatAt ? new Date(r.lastChatAt).getTime() : 0;
          const lastEventAt = Math.max(llmTs, chatTs);
          return {
            id: r.id,
            email: r.email,
            name: r.name,
            isAdmin: r.isAdmin,
            createdAt: r.createdAt,
            coupleId: r.coupleId,
            lastEventAt: lastEventAt > 0 ? new Date(lastEventAt).toISOString() : null,
          };
        });

        res.json({ users: shaped });
      } catch (err) {
        console.error("/api/admin/users failed:", err);
        res.status(500).json({ error: "list_failed" });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/admin",
    requireAuth,
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id);
        const isAdmin = !!(req.body && req.body.isAdmin);
        // Drop a tiny safety: never let the last admin demote themselves.
        // If isAdmin=false and this is the only admin, refuse.
        if (!isAdmin) {
          const [{ n }] = await db
            .select({ n: sql<number>`count(*)` })
            .from(users)
            .where(eq(users.isAdmin, true));
          if (n <= 1) {
            return res
              .status(409)
              .json({ error: "cannot_demote_last_admin" });
          }
        }
        const [updated] = await db
          .update(users)
          .set({ isAdmin })
          .where(eq(users.id, id))
          .returning({ id: users.id, isAdmin: users.isAdmin });
        if (!updated) return res.status(404).json({ error: "not_found" });
        res.json({ user: updated });
      } catch (err) {
        console.error("/api/admin/users/:id/admin failed:", err);
        res.status(500).json({ error: "toggle_failed" });
      }
    },
  );
}
