/**
 * User preferences — the configuration surface Tilly mutates via tool
 * calls. Each row is (userId, scope, key) → jsonb value. Mobile screens
 * GET the full set on mount and apply per-scope filters. Tools POST
 * upserts via this endpoint OR via the chat tool dispatcher.
 *
 * Scopes currently in use:
 *   spend   - hide_categories, alias_payment_to_card, ...
 *   today   - pinned_tiles, hide_tiles
 *   plaid   - alias_payment_to_card (per-merchant override)
 *   tilly   - greeting_style, quiet_hours, ...
 *
 * Reading rules: callers SHOULD treat unknown scopes as no-op. Adding a
 * new pref is just writing to a new (scope, key) — no schema migration.
 */
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { userPreferences } from "../../shared/schema";

export function registerUserPrefsRoutes(app: Express): void {
  app.get("/api/user-prefs", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.user.id));
    // Group by scope so the client can do prefs.spend.hide_categories etc.
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      grouped[r.scope] ??= {};
      grouped[r.scope][r.key] = r.value;
    }
    res.json({ prefs: grouped, count: rows.length });
  });

  app.post("/api/user-prefs", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const { scope, key, value } = req.body ?? {};
    if (typeof scope !== "string" || typeof key !== "string") {
      return res.status(400).json({ error: "scope + key required (strings)" });
    }
    if (value === undefined) {
      return res.status(400).json({ error: "value required (any json)" });
    }
    // Upsert via on-conflict update.
    await db
      .insert(userPreferences)
      .values({ userId: req.user.id, scope, key, value })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.scope, userPreferences.key],
        set: { value, updatedAt: new Date() },
      });
    res.json({ ok: true, scope, key, value });
  });

  app.delete("/api/user-prefs", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const { scope, key } = req.body ?? req.query ?? {};
    if (typeof scope !== "string" || typeof key !== "string") {
      return res.status(400).json({ error: "scope + key required" });
    }
    await db
      .delete(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, req.user.id),
          eq(userPreferences.scope, scope),
          eq(userPreferences.key, key),
        ),
      );
    res.json({ ok: true });
  });
}
