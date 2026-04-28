/**
 * Push notification registration + send.
 *
 *   POST /api/push/register       — client posts its Expo push token
 *   POST /api/push/test            — admin/dev: send a test push to self
 *   /api/cron/notify (cron.ts)    — daily fan-out (Phase 5c, replaces stub)
 *
 * Spec §5 initiative model: only push when an act-today protection
 * exists, outside the user's quiet hours, and not the same kind of
 * thing pushed in the last 24h.
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import { pushTokens } from "../../shared/schema";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
};

/** Send one-or-more Expo push messages. Returns Expo's tickets. */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<unknown> {
  if (messages.length === 0) return [];
  const resp = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Expo push API ${resp.status}: ${text}`);
  }
  return resp.json();
}

export function mountPushRoutes(app: Express): void {
  // Client registers its token on app launch.
  app.post("/api/push/register", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const { token, platform, deviceLabel } = req.body ?? {};
    if (typeof token !== "string" || !token.startsWith("ExponentPushToken")) {
      return res.status(400).json({ error: "valid expo push token required" });
    }
    if (!["ios", "android", "web"].includes(platform)) {
      return res.status(400).json({ error: "platform must be ios | android | web" });
    }

    try {
      // Upsert by token — same device re-registers if it relaunches.
      const existing = await db
        .select()
        .from(pushTokens)
        .where(eq(pushTokens.token, token))
        .limit(1);

      if (existing.length) {
        await db
          .update(pushTokens)
          .set({
            userId: req.user.id,
            platform,
            deviceLabel: deviceLabel ?? null,
            lastSeenAt: new Date(),
            disabledAt: null,
          })
          .where(eq(pushTokens.token, token));
      } else {
        await db.insert(pushTokens).values({
          userId: req.user.id,
          token,
          platform,
          deviceLabel: deviceLabel ?? null,
        });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("/api/push/register error:", err);
      res.status(500).json({ error: "register failed" });
    }
  });

  // Send a test push to the current user.
  app.post("/api/push/test", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const tokens = await db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, req.user.id)));
    const active = tokens.filter((t) => !t.disabledAt);
    if (active.length === 0) {
      return res.status(400).json({ error: "no active push tokens for this user" });
    }
    try {
      const tickets = await sendExpoPush(
        active.map((t) => ({
          to: t.token,
          title: "Tilly",
          body: "This is a test push. I'll only ever ping when it's worth your time.",
          data: { kind: "test" },
          sound: "default",
        })),
      );
      res.json({ sent: active.length, tickets });
    } catch (err: any) {
      console.error("/api/push/test error:", err);
      res.status(500).json({ error: err?.message ?? "push send failed" });
    }
  });
}
