/**
 * E2E session-issuer.
 *
 * Mounts ONLY when `E2E_SECRET` env var is set, AND every request to
 * the endpoint must present that secret in the `x-e2e-secret` header.
 * Mismatch → 404 (don't leak that the endpoint exists).
 *
 * Given the secret, issues a real `sessions` row for `E2E_USER_ID` and
 * returns the Bearer token the test suite uses for subsequent calls.
 * The session has a short TTL (30 min) so an accidental leak doesn't
 * grant long-lived access.
 *
 * Threat model: the secret is the only line of defense. Set it to a
 * long random string in Vercel + CI env. If you ever suspect it leaked,
 * unset the env var and the endpoint disappears entirely on next cold
 * start.
 */
import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sessions, users, plaidTransactions } from "../../shared/schema";

export function mountE2ERoutes(app: Express): void {
  const SECRET = process.env.E2E_SECRET;
  if (!SECRET) {
    console.log("[e2e] E2E_SECRET not set — endpoint not mounted");
    return;
  }
  const PINNED_USER_ID = process.env.E2E_USER_ID;
  const PINNED_USER_EMAIL = process.env.E2E_USER_EMAIL;
  console.log(
    `[e2e] /api/_e2e/issue-session mounted (${
      PINNED_USER_ID
        ? `pinned id ${PINNED_USER_ID.slice(0, 8)}…`
        : PINNED_USER_EMAIL
          ? `pinned email ${PINNED_USER_EMAIL}`
          : "most-active-user fallback"
    })`,
  );

  app.post("/api/_e2e/issue-session", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      // Don't leak that the endpoint exists. Same shape as any unmatched
      // Express route.
      return res.status(404).json({ error: "Not found" });
    }
    try {
      // Resolution order, most-specific first:
      //   1. E2E_USER_ID (uuid pin)
      //   2. E2E_USER_EMAIL (operator-stable identity — survives DB
      //      reseeds, no uuid lookup needed)
      //   3. The user with the most plaid_transactions rows ever —
      //      i.e. the active operator on a solo deployment. The
      //      previous "first user by createdAt" fallback picked stale
      //      seed/test users with no real data, which the smoke
      //      checks then mistakenly read as "Spend looks broken."
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({
          where: eq(users.id, PINNED_USER_ID),
        });
        if (!user) {
          return res.status(500).json({
            error: `E2E_USER_ID ${PINNED_USER_ID} not found in users table`,
          });
        }
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({
          where: eq(users.email, PINNED_USER_EMAIL),
        });
        if (!user) {
          return res.status(500).json({
            error: `E2E_USER_EMAIL ${PINNED_USER_EMAIL} not found in users table`,
          });
        }
      } else {
        // Pick the user whose household has the most accepted plaid
        // transactions. Ties broken by most-recent createdAt.
        const ranked = await db
          .select({
            userId: users.id,
            cnt: sql<number>`count(${plaidTransactions.id})::int`,
          })
          .from(users)
          .leftJoin(
            plaidTransactions,
            eq(plaidTransactions.coupleId, users.coupleId),
          )
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        const candidateId = ranked[0]?.userId;
        if (!candidateId) {
          return res.status(500).json({ error: "no users in DB to issue session for" });
        }
        user = await db.query.users.findFirst({
          where: eq(users.id, candidateId),
        });
        if (!user) {
          return res.status(500).json({ error: "no users in DB to issue session for" });
        }
      }
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min
      await db.insert(sessions).values({
        token,
        userId: user.id,
        expiresAt,
      });
      res.json({
        token,
        userId: user.id,
        coupleId: user.coupleId,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      console.error("[e2e] issue-session error:", err);
      res.status(500).json({ error: "issue failed" });
    }
  });
}
