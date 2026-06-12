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
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { sessions, users, plaidTransactions, expenses } from "../../shared/schema";
import { inArray } from "drizzle-orm";

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

  // GET /api/_e2e/duplicate-rows?merchantLike=...
  // Returns plaid_transactions rows that share (date, amount, label) with
  // another row in the same household. Used to diagnose why a category
  // total drifted from its drill-in — i.e. the Canada Txd $14,724 vs
  // $4,907.92 case. Resolves the same user as issue-session (pin or
  // most-active), so we look at real production data without exposing
  // anyone else's rows.
  app.get("/api/_e2e/duplicate-rows", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({ where: eq(users.id, PINNED_USER_ID) });
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({ where: eq(users.email, PINNED_USER_EMAIL) });
      } else {
        const ranked = await db
          .select({
            userId: users.id,
            cnt: sql<number>`count(${plaidTransactions.id})::int`,
          })
          .from(users)
          .leftJoin(plaidTransactions, eq(plaidTransactions.coupleId, users.coupleId))
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        const candidateId = ranked[0]?.userId;
        if (candidateId) {
          user = await db.query.users.findFirst({ where: eq(users.id, candidateId) });
        }
      }
      if (!user?.coupleId) {
        return res.status(404).json({ error: "no user/couple to inspect" });
      }
      const merchantLike = String(req.query.merchantLike ?? "").toLowerCase();
      const rows = await db
        .select()
        .from(plaidTransactions)
        .where(eq(plaidTransactions.coupleId, user.coupleId))
        .orderBy(desc(plaidTransactions.date));

      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const label = (r.merchantName || r.name || "").toLowerCase();
        if (merchantLike && !label.includes(merchantLike) && !(r.name || "").toLowerCase().includes(merchantLike)) continue;
        const key = `${r.date}|${r.amount}|${label}`;
        const list = groups.get(key) ?? [];
        list.push(r);
        groups.set(key, list);
      }
      const duplicates: Array<{ key: string; count: number; rows: typeof rows }> = [];
      for (const [key, list] of groups.entries()) {
        if (list.length > 1) duplicates.push({ key, count: list.length, rows: list });
      }
      duplicates.sort((a, b) => b.count - a.count);

      res.json({
        coupleId: user.coupleId,
        userId: user.id,
        merchantLike: merchantLike || null,
        totalRowsScanned: rows.length,
        duplicateGroupCount: duplicates.length,
        duplicates: duplicates.slice(0, 20),
      });
    } catch (err) {
      console.error("[e2e] duplicate-rows error:", err);
      res.status(500).json({ error: "inspect_failed" });
    }
  });

  // POST /api/_e2e/cleanup-duplicates?dryRun=true|false
  // Resolves the same user as the inspector. For each (date, amount,
  // label) duplicate group, keeps the row with the earliest createdAt
  // (the original Plaid import) and marks the rest for deletion along
  // with their linked expenses rows. Dry-run by default — never deletes
  // without explicit ?dryRun=false.
  app.post("/api/_e2e/cleanup-duplicates", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    const dryRun = String(req.query.dryRun ?? "true").toLowerCase() !== "false";
    try {
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({ where: eq(users.id, PINNED_USER_ID) });
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({ where: eq(users.email, PINNED_USER_EMAIL) });
      } else {
        const ranked = await db
          .select({
            userId: users.id,
            cnt: sql<number>`count(${plaidTransactions.id})::int`,
          })
          .from(users)
          .leftJoin(plaidTransactions, eq(plaidTransactions.coupleId, users.coupleId))
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        const candidateId = ranked[0]?.userId;
        if (candidateId) {
          user = await db.query.users.findFirst({ where: eq(users.id, candidateId) });
        }
      }
      if (!user?.coupleId) {
        return res.status(404).json({ error: "no user/couple to clean" });
      }

      const rows = await db
        .select()
        .from(plaidTransactions)
        .where(eq(plaidTransactions.coupleId, user.coupleId));

      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const label = (r.merchantName || r.name || "").toLowerCase();
        const key = `${r.date}|${r.amount}|${label}`;
        const list = groups.get(key) ?? [];
        list.push(r);
        groups.set(key, list);
      }

      const plan: Array<{
        key: string;
        keep: { id: string; createdAt: string | null; expenseId: string | null };
        deletePlaid: Array<{ id: string; createdAt: string | null; plaidTransactionId: string; expenseId: string | null }>;
        deleteExpenses: string[];
        phantomDollars: number;
      }> = [];
      let totalPlaidToDelete = 0;
      let totalExpensesToDelete = 0;
      let totalPhantomDollars = 0;

      for (const [key, list] of groups.entries()) {
        if (list.length <= 1) continue;
        // Keep earliest createdAt. The first inserted row represents the
        // original Plaid import — every later row is a re-import slip.
        const sorted = [...list].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt as unknown as string).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt as unknown as string).getTime() : 0;
          return ta - tb;
        });
        const keep = sorted[0];
        const drop = sorted.slice(1);
        const deleteExpenseIds = drop
          .map((r) => r.expenseId)
          .filter((id): id is string => typeof id === "string" && id !== keep.expenseId);
        const phantom = drop.reduce((s, r) => s + Math.abs(r.amount || 0), 0);
        plan.push({
          key,
          keep: {
            id: keep.id,
            createdAt: keep.createdAt as unknown as string,
            expenseId: keep.expenseId ?? null,
          },
          deletePlaid: drop.map((r) => ({
            id: r.id,
            createdAt: r.createdAt as unknown as string,
            plaidTransactionId: r.plaidTransactionId,
            expenseId: r.expenseId ?? null,
          })),
          deleteExpenses: deleteExpenseIds,
          phantomDollars: Math.round(phantom * 100) / 100,
        });
        totalPlaidToDelete += drop.length;
        totalExpensesToDelete += deleteExpenseIds.length;
        totalPhantomDollars += phantom;
      }
      plan.sort((a, b) => b.phantomDollars - a.phantomDollars);

      if (dryRun) {
        return res.json({
          dryRun: true,
          coupleId: user.coupleId,
          totalPlaidRowsToDelete: totalPlaidToDelete,
          totalExpenseRowsToDelete: totalExpensesToDelete,
          totalPhantomDollars: Math.round(totalPhantomDollars * 100) / 100,
          plan,
        });
      }

      // EXECUTE — wrapped in a transaction so partial-failure leaves
      // the DB consistent. Delete expenses first (FK-safe), then the
      // plaid_transactions rows.
      const allPlaidIds = plan.flatMap((p) => p.deletePlaid.map((r) => r.id));
      const allExpenseIds = plan.flatMap((p) => p.deleteExpenses);
      let deletedPlaid = 0;
      let deletedExpenses = 0;
      await db.transaction(async (txn) => {
        if (allExpenseIds.length > 0) {
          const r = await txn
            .delete(expenses)
            .where(inArray(expenses.id, allExpenseIds))
            .returning({ id: expenses.id });
          deletedExpenses = r.length;
        }
        if (allPlaidIds.length > 0) {
          const r = await txn
            .delete(plaidTransactions)
            .where(inArray(plaidTransactions.id, allPlaidIds))
            .returning({ id: plaidTransactions.id });
          deletedPlaid = r.length;
        }
      });

      return res.json({
        dryRun: false,
        coupleId: user.coupleId,
        deletedPlaidRows: deletedPlaid,
        deletedExpenseRows: deletedExpenses,
        phantomDollarsRemoved: Math.round(totalPhantomDollars * 100) / 100,
        groupsCleaned: plan.length,
      });
    } catch (err) {
      console.error("[e2e] cleanup-duplicates error:", err);
      res.status(500).json({ error: "cleanup_failed", message: (err as Error).message });
    }
  });

  // Diagnostic: for a given household, dump the cadenceOverrides map +
  // every >=$300 merchant's computed signature so we can see exactly
  // which sig the detector is keying by + whether it matches an
  // override. Built to debug "canada txd still shows up after monthly
  // override" 2026-05-17.
  app.get("/api/_e2e/cadence-debug", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({ where: eq(users.id, PINNED_USER_ID) });
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({ where: eq(users.email, PINNED_USER_EMAIL) });
      } else {
        const ranked = await db
          .select({ userId: users.id, cnt: sql<number>`count(${plaidTransactions.id})::int` })
          .from(users)
          .leftJoin(plaidTransactions, eq(plaidTransactions.coupleId, users.coupleId))
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        user = ranked[0] ? await db.query.users.findFirst({ where: eq(users.id, ranked[0].userId) }) : undefined;
      }
      if (!user?.coupleId) return res.status(404).json({ error: "no user" });

      const { userPreferences: upTbl } = await import("../../shared/schema");
      const { merchantSignature } = await import("../tilly/merchant-rules");

      const overrideRows = await db
        .select({ key: upTbl.key, value: upTbl.value })
        .from(upTbl)
        .where(and(eq(upTbl.userId, user.id), eq(upTbl.scope, "taxonomy")));
      const cadenceOverrides: Record<string, string> = {};
      for (const r of overrideRows) {
        if (!r.key.startsWith("cadence_override.")) continue;
        const v = r.value as { cadence?: string } | null;
        if (v?.cadence) cadenceOverrides[r.key.slice("cadence_override.".length)] = v.cadence;
      }

      const rows = await db
        .select({
          amount: plaidTransactions.amount,
          merchantName: plaidTransactions.merchantName,
          name: plaidTransactions.name,
          date: plaidTransactions.date,
        })
        .from(plaidTransactions)
        .where(
          and(
            eq(plaidTransactions.coupleId, user.coupleId),
            sql`${plaidTransactions.amount} >= 300`,
          ),
        );

      const byMerchant = new Map<string, { sig: string; merch: string; dates: string[]; matchesOverride: string | null }>();
      for (const r of rows) {
        const merch = (r.merchantName ?? r.name ?? "").trim();
        if (!merch) continue;
        const sig = merchantSignature({
          merchantName: r.merchantName ?? null,
          name: r.name ?? "",
          amount: r.amount,
        });
        const e =
          byMerchant.get(sig) ?? {
            sig,
            merch: merch.toLowerCase(),
            dates: [],
            matchesOverride: cadenceOverrides[sig] ?? null,
          };
        e.dates.push(r.date);
        byMerchant.set(sig, e);
      }

      res.json({
        userId: user.id,
        coupleId: user.coupleId,
        cadenceOverrides,
        merchants: [...byMerchant.values()].map((v) => ({
          sig: v.sig,
          displayMerch: v.merch,
          hits: v.dates.length,
          matchesOverride: v.matchesOverride,
        })),
      });
    } catch (err) {
      console.error("[e2e] cadence-debug error:", err);
      res.status(500).json({ error: "debug failed", message: (err as Error).message });
    }
  });

  // Income-path diagnostic — shows the raw income rows the projection
  // math reads, what the dedupe/anomaly defenses keep vs quarantine,
  // and the final getMonthlyIncome / projectRemainingIncomeForMonth
  // outputs. Built to verify the "$173,496 before month-end" hero fix
  // against live data: the response names the exact pollutant rows.
  app.get("/api/_e2e/income-debug", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({ where: eq(users.id, PINNED_USER_ID) });
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({ where: eq(users.email, PINNED_USER_EMAIL) });
      } else {
        const ranked = await db
          .select({ userId: users.id, cnt: sql<number>`count(${plaidTransactions.id})::int` })
          .from(users)
          .leftJoin(plaidTransactions, eq(plaidTransactions.coupleId, users.coupleId))
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        user = ranked[0] ? await db.query.users.findFirst({ where: eq(users.id, ranked[0].userId) }) : undefined;
      }
      if (!user?.coupleId) return res.status(404).json({ error: "no user" });

      const {
        getMonthlyIncome,
        projectRemainingIncomeForMonth,
        dedupeIncomeRows,
        splitAnomalousIncome,
      } = await import("../tilly/income-summary");
      const { getUserTimezone, localDaysAgoIso } = await import("../tilly/user-tz");
      const tz = await getUserTimezone(user.id);
      const now = new Date();
      const sinceIso = localDaysAgoIso(now, tz, 90);

      // Raw, unfiltered — every row the OLD math used to read.
      const rawRows = await db
        .select({
          amount: plaidTransactions.amount,
          date: plaidTransactions.date,
          merchantName: plaidTransactions.merchantName,
          name: plaidTransactions.name,
          status: plaidTransactions.status,
          pending: plaidTransactions.pending,
        })
        .from(plaidTransactions)
        .where(
          and(
            eq(plaidTransactions.coupleId, user.coupleId),
            eq(plaidTransactions.ourCategory, "income"),
            sql`${plaidTransactions.date} >= ${sinceIso}`,
          ),
        );

      const nonIgnored = rawRows.filter((r) => r.status !== "ignored");
      const deduped = dedupeIncomeRows(nonIgnored);
      const { typical, anomalous, medianAmount } = splitAnomalousIncome(deduped);

      const [monthlyIncome, projection] = await Promise.all([
        getMonthlyIncome(user.id, user.coupleId, now),
        projectRemainingIncomeForMonth(user.coupleId, now, tz),
      ]);

      res.json({
        userId: user.id,
        coupleId: user.coupleId,
        tz,
        windowSince: sinceIso,
        counts: {
          raw90d: rawRows.length,
          ignoredGhosts: rawRows.length - nonIgnored.length,
          dedupeCollapsed: nonIgnored.length - deduped.length,
          typical: typical.length,
          anomalousQuarantined: anomalous.length,
        },
        medianPaycheck: medianAmount,
        quarantinedRows: anomalous.map((r) => ({
          date: r.date,
          amount: r.amount,
          merchant: r.merchantName ?? r.name,
        })),
        typicalRows: typical.map((r) => ({
          date: r.date,
          amount: r.amount,
          merchant: r.merchantName ?? r.name,
        })),
        ignoredRows: rawRows
          .filter((r) => r.status === "ignored")
          .map((r) => ({ date: r.date, amount: r.amount, merchant: r.merchantName ?? r.name })),
        monthlyIncome,
        projection,
      });
    } catch (err) {
      console.error("[e2e] income-debug error:", err);
      res.status(500).json({ error: "income-debug failed", message: (err as Error).message });
    }
  });

  // Inspect raw skills table for diagnostic — returns embedding length
  // per row so we can see whether embeddings actually persisted.
  app.get("/api/_e2e/skill-rows", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) return res.status(404).json({ error: "Not found" });
    try {
      const { tillySkills } = await import("../../shared/schema");
      const rows = await db.select().from(tillySkills);
      res.json({
        count: rows.length,
        rows: rows.map((r) => ({
          name: r.name,
          status: r.status,
          embeddingLength: r.triggerEmbedding?.length ?? 0,
          embeddingFirst3: r.triggerEmbedding?.slice(0, 3) ?? null,
          triggerPhraseCount: r.triggerPhrases?.length ?? 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: "inspect failed", message: (err as Error).message });
    }
  });

  // Skill retrieval debug — directly hit retrieveSkillsForMessage so
  // we can see what similarity scores a given message produces against
  // the live skill library. Useful for tuning the threshold.
  app.post("/api/_e2e/skill-retrieve-debug", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) return res.status(404).json({ error: "Not found" });
    try {
      const message = String(req.body?.message ?? "").trim();
      if (!message) return res.status(400).json({ error: "message required" });
      const { embed } = await import("../tilly/embeddings");
      const queryEmbedding = await embed(message, { route: "skill-retrieve-debug" });
      const { tillySkills } = await import("../../shared/schema");
      const skills = await db.select().from(tillySkills).where(eq(tillySkills.status, "active"));

      // Compute cosine for every active skill directly so we can see
      // what scores actually are — bypasses the threshold filter.
      function cosine(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
        return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
      }
      const scores = skills.map((s) => ({
        name: s.name,
        sim: queryEmbedding && s.triggerEmbedding ? cosine(queryEmbedding, s.triggerEmbedding) : null,
      })).sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0));

      res.json({
        message,
        embedSucceeded: queryEmbedding !== null,
        queryEmbeddingLength: queryEmbedding?.length ?? 0,
        activeSkillCount: skills.length,
        scores,
      });
    } catch (err) {
      res.status(500).json({ error: "debug failed", message: (err as Error).message });
    }
  });

  // Bulk-seed skills from an admin-provided payload. Used by the
  // backfill script to populate tilly_skills with the skills we
  // induced manually from this week's actual user trajectories.
  // Gated by E2E_SECRET (same as other diagnostic routes).
  app.post("/api/_e2e/seed-skills", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const seedsRaw = req.body?.seeds;
      if (!Array.isArray(seedsRaw)) {
        return res.status(400).json({ error: "seeds array required" });
      }
      const { seedSkills } = await import("../tilly/skills");
      const out = await seedSkills(seedsRaw);
      res.json({ ok: true, ...out });
    } catch (err) {
      console.error("[e2e] seed-skills error:", err);
      res.status(500).json({ error: "seed failed", message: (err as Error).message });
    }
  });

  // Smart Tilly verification endpoint — runs every detector against the
  // resolved user (same as issue-session) and returns the full set of
  // observations + supporting context. Lets the report assembly script
  // capture sample output without going through chat or rendering UI.
  app.get("/api/_e2e/detectors-snapshot", async (req: Request, res: Response) => {
    const header = req.header("x-e2e-secret");
    if (!header || header !== SECRET) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      let user;
      if (PINNED_USER_ID) {
        user = await db.query.users.findFirst({ where: eq(users.id, PINNED_USER_ID) });
      } else if (PINNED_USER_EMAIL) {
        user = await db.query.users.findFirst({ where: eq(users.email, PINNED_USER_EMAIL) });
      } else {
        const ranked = await db
          .select({
            userId: users.id,
            cnt: sql<number>`count(${plaidTransactions.id})::int`,
          })
          .from(users)
          .leftJoin(plaidTransactions, eq(plaidTransactions.coupleId, users.coupleId))
          .groupBy(users.id, users.createdAt)
          .orderBy(desc(sql`count(${plaidTransactions.id})`), desc(users.createdAt))
          .limit(1);
        const candidateId = ranked[0]?.userId;
        if (candidateId) {
          user = await db.query.users.findFirst({ where: eq(users.id, candidateId) });
        }
      }
      if (!user?.coupleId) {
        return res.status(404).json({ error: "no user/couple to inspect" });
      }
      const { runAllDetectors } = await import("../tilly/detectors");
      const { getUserTimezone } = await import("../tilly/user-tz");
      const { userPreferences: upTbl } = await import("../../shared/schema");
      const tz = await getUserTimezone(user.id);
      // Read the user's cadence overrides so the snapshot mirrors what
      // the LIVE today endpoint shows. Without this the snapshot
      // misleads — bills the user already silenced (via
      // setMerchantCadence) still surface here, giving a false signal
      // that the detector is broken when actually the override-aware
      // live path is correct. Built-in defense-in-depth after spending
      // an hour chasing a fake bug 2026-05-17.
      const overrideRows = await db
        .select({ key: upTbl.key, value: upTbl.value })
        .from(upTbl)
        .where(and(eq(upTbl.userId, user.id), eq(upTbl.scope, "taxonomy")));
      const cadenceOverrides = new Map<string, string>();
      for (const r of overrideRows) {
        if (!r.key.startsWith("cadence_override.")) continue;
        const v = r.value as { cadence?: string } | null;
        if (v?.cadence) cadenceOverrides.set(r.key.slice("cadence_override.".length), v.cadence);
      }
      const observations = await runAllDetectors(
        user.id,
        user.coupleId,
        new Date(),
        tz,
        new Map(),
        cadenceOverrides,
      );
      res.json({
        userId: user.id,
        coupleId: user.coupleId,
        tz,
        timestamp: new Date().toISOString(),
        observationCount: observations.length,
        observations,
      });
    } catch (err) {
      console.error("[e2e] detectors-snapshot error:", err);
      res.status(500).json({
        error: "snapshot_failed",
        message: (err as Error).message,
      });
    }
  });
}
