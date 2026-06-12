/**
 * Task #23 — sync-time proactive questions.
 *
 * After every Plaid sync, scan the household's recent activity for things
 * Tilly should reasonably ask about, and persist them to `tilly_questions`.
 * The questions appear on Today + chat; answering them can promote a
 * merchant rule so Tilly never asks again.
 *
 * Three classifiers:
 *   1. unknown_merchant — a signature that's been seen ≥3 times in the
 *      last 30 days, has no merchant_rule, and currently has at least one
 *      pending row. ("I'm seeing Frank Bistro a lot — is that a regular?")
 *   2. category_spike   — a category whose 7-day total is >50% above the
 *      6-week median for that category. ("Coffee is up 80% this week.")
 *   3. outsized_tx      — a single transaction more than 2× the median
 *      amount for the same merchant signature. ("$240 at Trader Joe's
 *      this week is a lot more than usual — anything special?")
 *
 * Cap: at most 3 OPEN questions per household at any time. We dedupe by
 * (kind, signature/category) so a sync that runs twice in five minutes
 * doesn't create duplicates.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  plaidTransactions,
  tillyQuestions,
  merchantRules,
  members,
} from "../../shared/schema";
import { merchantSignature } from "./merchant-rules";

const MAX_OPEN_QUESTIONS = 3;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

async function pickHouseholdUserId(householdId: string): Promise<string | null> {
  const [m] = await db
    .select()
    .from(members)
    .where(eq(members.coupleId, householdId))
    .limit(1);
  return m?.userId ?? null;
}

export type GeneratedQuestion = {
  kind: "unknown_merchant" | "category_spike" | "outsized_tx" | "large_deposit";
  body: string;
  payload: Record<string, unknown>;
};

/**
 * Run the analyzer for one household. Idempotent — re-running it after a
 * subsequent sync only adds rows for newly-spotted patterns.
 */
export async function generateQuestionsForHousehold(householdId: string): Promise<{
  inserted: number;
  considered: number;
}> {
  const userId = await pickHouseholdUserId(householdId);
  if (!userId) return { inserted: 0, considered: 0 };

  // Task #23 fix: serialize concurrent generators per household so two
  // overlapping syncs (manual sync + Plaid webhook fired in the same
  // moment) can't each see "0 open" and then each insert 3 fresh rows,
  // blowing past the cap. We hold a Postgres transaction-scoped advisory
  // lock keyed on the household id; the second caller blocks until the
  // first commits, then re-reads the open count and finds no slots.
  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"tilly-q:" + householdId}))`,
    );

    // How many open questions does this household already have?
    const openExisting = await tx
      .select()
      .from(tillyQuestions)
      .where(
        and(
          eq(tillyQuestions.householdId, householdId),
          eq(tillyQuestions.status, "open"),
        ),
      );
    const slots = MAX_OPEN_QUESTIONS - openExisting.length;
    if (slots <= 0) return { inserted: 0, considered: 0 };

  // Build the dedupe key set so we don't re-ask the same thing. Per
  // architect (round 5): include answered AND dismissed questions, not
  // just open ones — otherwise a closed "what is Frank Bistro?" can be
  // regenerated on the next sync, defeating the "only ask once" goal.
  // Cooldown: 60 days; after that we'll allow asking again in case the
  // merchant pattern materially changed.
  const cooldownCutoff = new Date();
  cooldownCutoff.setDate(cooldownCutoff.getDate() - 60);
  const allRecent = await tx
    .select()
    .from(tillyQuestions)
    .where(
      and(
        eq(tillyQuestions.householdId, householdId),
        gte(tillyQuestions.createdAt, cooldownCutoff),
      ),
    );
  const seenKey = new Set<string>();
  for (const q of allRecent) {
    const p = (q.payload ?? {}) as Record<string, unknown>;
    const key = `${q.kind}::${(p.signature as string) ?? (p.category as string) ?? ""}`;
    seenKey.add(key);
  }

  const candidates: GeneratedQuestion[] = [];

  // ── 0. large_deposit — income anomaly confirmation ────────────────────
  // The income guard quarantines large non-paycheck-shaped deposits from
  // every projection until confirmed. Surface ONE question per pending
  // anomaly so the user can resolve it in a tap instead of discovering a
  // conservative income number and wondering why. Highest priority —
  // it's the user's own money sitting outside the math.
  try {
    const {
      readIncomeRows,
      splitAnomalousIncome,
      loadConfirmedIncomeKeys,
      incomeAnomalyKey,
    } = await import("./income-summary");
    const [incomeRows, confirmedKeys] = await Promise.all([
      readIncomeRows(householdId, isoDaysAgo(90)),
      loadConfirmedIncomeKeys(userId),
    ]);
    const { anomalous } = splitAnomalousIncome(incomeRows, confirmedKeys);
    for (const r of anomalous) {
      const key = incomeAnomalyKey(r);
      const merch = (r.merchantName ?? r.name ?? "a deposit").trim();
      candidates.push({
        kind: "large_deposit",
        body: `I'm not counting the $${Math.round(Math.abs(r.amount)).toLocaleString()} ${merch} deposit (${r.date}) as income until you confirm — is it real income (bonus, payout), or a transfer between your own accounts?`,
        payload: { signature: key, date: r.date, amount: Math.abs(r.amount), merchant: merch },
      });
    }
  } catch (err) {
    console.warn("[questions] large_deposit classifier failed:", err);
  }

  // ── 1. unknown_merchant ────────────────────────────────────────────────
  const since30 = isoDaysAgo(30);
  const recent = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, since30),
      ),
    );

  type Bucket = {
    signature: string;
    display: string;
    count: number;
    pendingIds: string[];
    amounts: number[];
    hasPending: boolean;
  };
  const bySig = new Map<string, Bucket>();
  for (const r of recent) {
    const sig = merchantSignature(r);
    const display = r.merchantName || r.name;
    const b = bySig.get(sig) ?? {
      signature: sig,
      display,
      count: 0,
      pendingIds: [],
      amounts: [],
      hasPending: false,
    };
    b.count += 1;
    b.amounts.push(r.amount);
    if (r.status === "pending_review") {
      b.hasPending = true;
      b.pendingIds.push(r.id);
    }
    bySig.set(sig, b);
  }

  // Filter to unknown signatures (no rule yet) with ≥3 unaccepted (pending
  // or ignored) rows. Per task spec: counting all rows would let an already-
  // accepted recurring merchant trigger a redundant question whenever a new
  // pending row arrives. We only want to surface signatures the user
  // genuinely hasn't decided about yet.
  const unknownCandidates = [...bySig.values()].filter(
    (b) => b.pendingIds.length >= 3,
  );
  if (unknownCandidates.length > 0) {
    const sigs = unknownCandidates.map((b) => b.signature);
    const ruleRows = await db
      .select()
      .from(merchantRules)
      .where(
        and(
          eq(merchantRules.coupleId, householdId),
          sql`${merchantRules.signature} = ANY(${sigs}::text[])`,
        ),
      );
    const haveRule = new Set(ruleRows.map((r) => r.signature));
    for (const b of unknownCandidates) {
      if (haveRule.has(b.signature)) continue;
      candidates.push({
        kind: "unknown_merchant",
        body: `I'm seeing ${b.display} ${b.count} times this month — what is it?`,
        payload: {
          signature: b.signature,
          merchant: b.display,
          count: b.count,
          totalAmount: b.amounts.reduce((s, x) => s + x, 0),
          pendingIds: b.pendingIds.slice(0, 10),
        },
      });
    }
  }

  // ── 2. category_spike ──────────────────────────────────────────────────
  const since42 = isoDaysAgo(42);
  const longRecent = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        gte(plaidTransactions.date, since42),
        eq(plaidTransactions.status, "accepted"),
      ),
    );
  // Build per-week per-category totals.
  const since7 = isoDaysAgo(7);
  const weeklyTotals = new Map<string, number>(); // category → this-week
  const historicalWeeks = new Map<string, number[]>(); // category → [w1,w2,…]
  // Bucket older accepted txns into weeks (ISO week start since 42 days ago).
  function weekIndex(dateStr: string): number {
    const t = new Date(dateStr).getTime();
    const start = new Date(since42).getTime();
    return Math.floor((t - start) / (7 * 24 * 60 * 60 * 1000));
  }
  for (const r of longRecent) {
    const cat = (r.ourCategory || "other").toLowerCase();
    if (r.date >= since7) {
      weeklyTotals.set(cat, (weeklyTotals.get(cat) ?? 0) + r.amount);
    } else {
      const wi = weekIndex(r.date);
      const arr = historicalWeeks.get(cat) ?? [];
      arr[wi] = (arr[wi] ?? 0) + r.amount;
      historicalWeeks.set(cat, arr);
    }
  }
  for (const [cat, thisWeek] of weeklyTotals.entries()) {
    if (thisWeek < 25) continue; // ignore tiny categories
    const hist = (historicalWeeks.get(cat) ?? []).filter((x) => x > 0);
    if (hist.length < 3) continue;
    const med = median(hist);
    if (med <= 0) continue;
    const ratio = thisWeek / med;
    if (ratio >= 1.5) {
      candidates.push({
        kind: "category_spike",
        body: `${cat} is up ${Math.round((ratio - 1) * 100)}% this week — anything I should know?`,
        payload: {
          category: cat,
          thisWeek: Math.round(thisWeek),
          baseline: Math.round(med),
          ratio: Math.round(ratio * 100) / 100,
        },
      });
    }
  }

  // ── 3. outsized_tx ─────────────────────────────────────────────────────
  // Single accepted tx in the last 7 days more than 2× the merchant median.
  for (const [sig, b] of bySig.entries()) {
    if (b.amounts.length < 3) continue;
    const med = median(b.amounts);
    if (med <= 0) continue;
    const recentBig = recent.find(
      (r) => (merchantSignature(r)) === sig && r.date >= since7 && r.amount >= med * 2 && r.amount >= 50,
    );
    if (recentBig) {
      candidates.push({
        kind: "outsized_tx",
        body: `$${recentBig.amount.toFixed(2)} at ${b.display} is bigger than usual — special occasion?`,
        payload: {
          signature: sig,
          merchant: b.display,
          amount: recentBig.amount,
          median: Math.round(med * 100) / 100,
          plaidTxnId: recentBig.id,
        },
      });
    }
  }

  // ── Insert up to `slots`, skipping duplicates ──────────────────────────
  let inserted = 0;
  for (const c of candidates) {
    if (inserted >= slots) break;
    const key = `${c.kind}::${(c.payload.signature as string) ?? (c.payload.category as string) ?? ""}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    await tx.insert(tillyQuestions).values({
      userId,
      householdId,
      kind: c.kind,
      body: c.body,
      payload: c.payload,
      status: "open",
    });
    inserted += 1;
  }

  if (inserted > 0) {
    console.log(`[question-generator] inserted ${inserted} for household ${householdId}`);
  }
    return { inserted, considered: candidates.length };
  });
}

/** Return up to `limit` open questions for a household. */
export async function listOpenQuestions(householdId: string, limit = 3) {
  return db
    .select()
    .from(tillyQuestions)
    .where(
      and(
        eq(tillyQuestions.householdId, householdId),
        eq(tillyQuestions.status, "open"),
      ),
    )
    .orderBy(desc(tillyQuestions.createdAt))
    .limit(limit);
}
