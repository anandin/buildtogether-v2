/**
 * Household onboarding + status routes.
 *
 *   GET  /api/household/onboarding-status   — read flags so the client can route
 *   POST /api/household/complete-onboarding — flip hasCompletedOnboarding=true
 *   POST /api/household/create              — create a household + owner member,
 *                                             assign to user (first-run after sign-up)
 *
 * Phase 1's schema kept legacy `couples` column names for back-compat; this
 * router uses the renamed `households` / `members` tables but reads from the
 * legacy `users.coupleId` column for back-compat (Phase 1c will migrate it).
 */
import type { Express, Request, Response } from "express";
import { eq, and, sql } from "drizzle-orm";

import { requireAuth } from "../middleware/auth";
import { db } from "../db";
import {
  users,
  households,
  members,
  plaidItems,
  goals,
  commitments,
  tillyMoneySnapshot,
  tillyMemory,
  guardianConversations,
} from "../../shared/schema";

export function mountHouseholdRoutes(app: Express): void {
  // Read onboarding status — drives the BTApp onboarding gate.
  app.get(
    "/api/household/onboarding-status",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const householdId = req.user.coupleId;

      if (!householdId) {
        return res.json({
          hasHousehold: false,
          hasCompletedOnboarding: false,
          hasPlaid: false,
          hasDream: false,
          hasCommitment: false,
        });
      }

      try {
        const [hh, plaidCount, dreamCount, commitmentCount] = await Promise.all([
          db.query.households.findFirst({ where: eq(households.id, householdId) }),
          db
            .select({ c: sql<number>`count(*)::int` })
            .from(plaidItems)
            .where(eq(plaidItems.coupleId, householdId)),
          db
            .select({ c: sql<number>`count(*)::int` })
            .from(goals)
            .where(eq(goals.coupleId, householdId)),
          db
            .select({ c: sql<number>`count(*)::int` })
            .from(commitments)
            .where(eq(commitments.coupleId, householdId)),
        ]);

        res.json({
          hasHousehold: true,
          hasCompletedOnboarding: !!hh?.hasCompletedOnboarding,
          hasPlaid: (plaidCount[0]?.c ?? 0) > 0,
          hasDream: (dreamCount[0]?.c ?? 0) > 0,
          hasCommitment: (commitmentCount[0]?.c ?? 0) > 0,
        });
      } catch (err) {
        console.error("/api/household/onboarding-status error:", err);
        res.status(500).json({ error: "status failed" });
      }
    },
  );

  // Create a household for the user (first-run after sign-up).
  app.post(
    "/api/household/create",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;

      // Idempotent — if user already has a household, return it.
      if (req.user.coupleId) {
        return res.json({ householdId: req.user.coupleId, created: false });
      }

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const schoolName =
        typeof req.body?.schoolName === "string" ? req.body.schoolName.trim() : null;
      const studentRole =
        typeof req.body?.studentRole === "string" ? req.body.studentRole.trim() : null;

      try {
        const householdId = await db.transaction(async (tx) => {
          const [hh] = await tx
            .insert(households)
            .values({
              partner1Name: name || "You",
              connectedSince: new Date().toISOString().slice(0, 10),
              schoolName,
              schoolShort: schoolName?.slice(0, 8) ?? null,
              studentRole,
            })
            .returning({ id: households.id });

          await tx.insert(members).values({
            coupleId: hh.id, // legacy column name
            partnerId: userId,
            userId,
            name: name || req.user!.name || "You",
            role: "owner",
          });

          await tx.update(users).set({ coupleId: hh.id }).where(eq(users.id, userId));

          return hh.id;
        });

        res.json({ householdId, created: true });
      } catch (err) {
        console.error("/api/household/create error:", err);
        res.status(500).json({ error: "create failed" });
      }
    },
  );

  // Mark onboarding complete — called from the last onboarding card.
  //
  // Optional body: { moneySnapshot?: { monthlyIncome?, currentBalance?, primaryBank? } }
  // When the beta user skipped Plaid, the bank card collects a manual
  // money snapshot. We persist it so state-summary.ts can give Tilly real
  // numbers instead of $0 placeholders, and write a matching memory row
  // so it shows up in the dossier and can be revised later in chat.
  //
  // Always-on: seeds a Tilly welcome chat message into guardian_conversations
  // so the chat tab isn't an empty room when the user first lands.
  app.post(
    "/api/household/complete-onboarding",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const userId = req.user.id;
      const userName = req.user.name?.split(" ")[0] ?? "there";
      const householdId = req.user.coupleId;
      if (!householdId) {
        return res.status(400).json({ error: "no household — call /api/household/create first" });
      }

      const snap = req.body?.moneySnapshot ?? null;
      const monthlyIncome =
        snap && Number.isFinite(Number(snap.monthlyIncome)) && Number(snap.monthlyIncome) > 0
          ? Number(snap.monthlyIncome)
          : null;
      const currentBalance =
        snap && Number.isFinite(Number(snap.currentBalance)) && Number(snap.currentBalance) >= 0
          ? Number(snap.currentBalance)
          : null;
      const primaryBank =
        snap && typeof snap.primaryBank === "string" && snap.primaryBank.trim()
          ? snap.primaryBank.trim().slice(0, 80)
          : null;
      const hasSnapshot = monthlyIncome !== null || currentBalance !== null || !!primaryBank;

      try {
        // All side effects are gated on the false→true transition of
        // hasCompletedOnboarding and run inside a single transaction so
        // a failed step rolls back the flag flip. This makes the
        // endpoint idempotent — replays/retries return ok:true with
        // firstCompletion:false and no duplicate snapshots, memories,
        // or welcome messages.
        const result = await db.transaction(async (tx) => {
          const [hh] = await tx
            .select({ done: households.hasCompletedOnboarding })
            .from(households)
            .where(eq(households.id, householdId))
            .for("update")
            .limit(1);

          if (!hh) throw new Error("household disappeared mid-request");
          if (hh.done) {
            return { firstCompletion: false, seededSnapshot: false };
          }

          await tx
            .update(households)
            .set({ hasCompletedOnboarding: true })
            .where(eq(households.id, householdId));

          // Persist the manual money snapshot if any field was provided.
          if (hasSnapshot) {
            await tx.insert(tillyMoneySnapshot).values({
              householdId,
              userId,
              monthlyIncome,
              currentBalance,
              primaryBank,
              source: "onboarding",
            });

            // Mirror into the memory layer as an observation so it shows
            // up on the Profile timeline and feeds the dossier.
            const parts: string[] = [];
            if (monthlyIncome !== null) parts.push(`makes about $${Math.round(monthlyIncome)}/mo`);
            if (currentBalance !== null) parts.push(`has roughly $${Math.round(currentBalance)} in checking right now`);
            if (primaryBank) parts.push(`banks with ${primaryBank}`);
            if (parts.length) {
              await tx.insert(tillyMemory).values({
                userId,
                householdId,
                kind: "observation",
                body: `${userName} ${parts.join(", ")} — told me at signup, no bank linked yet.`,
                source: "onboarding",
                dateLabel: "Today",
                isMostRecent: true,
              });
            }
          }

          // Welcome copy branches on actual Plaid connection state, not
          // just whether they shared a manual snapshot. Three buckets:
          //   1. Bank linked    → "I can see your accounts, here we go"
          //   2. Manual snapshot → "Thanks for telling me where you're at"
          //   3. Neither         → "Tell me as you go, no bank needed"
          const [activePlaid] = await tx
            .select({ id: plaidItems.id })
            .from(plaidItems)
            .where(
              and(
                eq(plaidItems.coupleId, householdId),
                eq(plaidItems.status, "active"),
              ),
            )
            .limit(1);

          let welcome: string;
          if (activePlaid) {
            welcome = `Hey ${userName}. Your bank's wired up — I can see what's coming in and going out. I'll stay quiet unless something's worth flagging. Whenever you want to think out loud about money, this is the place.`;
          } else if (hasSnapshot) {
            welcome = `Hey ${userName}. Thanks for telling me where you're starting from — I've got it written down. Whenever something happens with your money, just tell me here and I'll keep track. No bank needed for us to talk.`;
          } else {
            welcome = `Hey ${userName}. I'm Tilly. We don't have your bank wired up yet, but we don't need it to start — just tell me about anything you spend ("$5 coffee") or anything that's on your mind, and I'll remember. When you're ready to link a bank, the option's on your home screen.`;
          }
          await tx.insert(guardianConversations).values({
            coupleId: householdId,
            userId,
            role: "guardian",
            content: welcome,
            intent: "welcome",
          });

          return { firstCompletion: true, seededSnapshot: hasSnapshot };
        });

        res.json({ ok: true, ...result });
      } catch (err) {
        console.error("/api/household/complete-onboarding error:", err);
        res.status(500).json({ error: "complete failed" });
      }
    },
  );

  // ─── Trusted people (members) ─────────────────────────────────────────
  // Spec §4.6 trusted people. Roles: owner | trusted_viewer | splitter | family.

  app.get("/api/household/members", requireAuth, async (req: Request, res: Response) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    const householdId = req.user.coupleId;
    if (!householdId) return res.json({ members: [] });
    try {
      const rows = await db
        .select()
        .from(members)
        .where(eq(members.coupleId, householdId));
      res.json({
        members: rows.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role,
          scope: m.scope,
          color: m.color,
        })),
      });
    } catch (err) {
      console.error("/api/household/members error:", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  app.post(
    "/api/household/members",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });

      const { name, role, scope, color } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name required" });
      }
      if (!["trusted_viewer", "splitter", "family"].includes(role)) {
        return res.status(400).json({ error: "role must be trusted_viewer | splitter | family" });
      }

      try {
        const [created] = await db
          .insert(members)
          .values({
            coupleId: householdId,
            partnerId: "",
            name: name.trim(),
            role,
            scope: typeof scope === "string" ? scope : null,
            color: typeof color === "string" ? color : null,
          })
          .returning();
        res.json({
          member: {
            id: created.id,
            name: created.name,
            role: created.role,
            scope: created.scope,
            color: created.color,
          },
        });
      } catch (err) {
        console.error("/api/household/members POST error:", err);
        res.status(500).json({ error: "invite failed" });
      }
    },
  );

  app.delete(
    "/api/household/members/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      if (!req.user) return res.status(401).json({ error: "auth required" });
      const householdId = req.user.coupleId;
      if (!householdId) return res.status(400).json({ error: "no household" });
      const id = String(req.params.id);

      try {
        const result = await db
          .delete(members)
          .where(and(eq(members.id, id), eq(members.coupleId, householdId)))
          .returning({ id: members.id, role: members.role });
        if (!result.length) return res.status(404).json({ error: "member not found" });
        if (result[0].role === "owner") {
          return res.status(400).json({ error: "cannot remove the owner" });
        }
        res.json({ ok: true });
      } catch (err) {
        console.error("/api/household/members DELETE error:", err);
        res.status(500).json({ error: "remove failed" });
      }
    },
  );
}
