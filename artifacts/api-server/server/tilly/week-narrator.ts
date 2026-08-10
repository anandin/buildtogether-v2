/**
 * Week narrator — reads the week's transactions as a life record, not a
 * ledger.
 *
 * The principle: **spend = life + leakage.** A heavy week is almost
 * never uniformly heavy — it's meaningful spending (a birthday, a
 * visit, the kids' start-of-school) with friction riding along
 * (delivery fees, a duplicate charge, a trial that quietly converted).
 * The narrator's job is to SEPARATE them:
 *
 *   - The life-spend is affirmed and never criticized. "Heavy week on
 *     the kids — those memories were worth it" is only sayable by a
 *     system that recognized the story; recognizing it is the whole
 *     point of having an LLM here.
 *   - The leakage is named with specifics the user can check: actual
 *     merchants, actual fees, actual duplicates. Never vibes. The
 *     deterministic finders below are the only source of leakage claims
 *     — the LLM phrases them, it does not discover them.
 *
 * Trust boundaries (all enforced, not requested):
 *   - Fabrication guard: every dollar figure in the narrative must
 *     exist in the data we handed the model (same lesson as the $173k
 *     hero bug — the narrative layer is where wrong numbers reach the
 *     user).
 *   - Story confidence: when the model can't identify a coherent story
 *     it must say so, and the caller falls back to the deterministic
 *     composer. A guessed story ("fun week!" over a car repair) is
 *     worse than no story.
 *   - Income guard: while the denominator is unverified the narrative
 *     may not assert surplus (shares daily-brief's assertsSurplus).
 */
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db";
import {
  expenses,
  plaidTransactions,
  tillyLifeContext,
  tillyMemory,
} from "../../shared/schema";
import { assertsSurplus, dollarFiguresIn } from "./daily-brief";
import { getLatestDossier, formatDossierForPrompt } from "./dossier-rewriter";
import { getLLM } from "./llm/factory";
import { bucketFor, loadUserOverrides } from "./taxonomy";

// ─── Week transactions, merchant-level ───────────────────────────────

export type WeekTx = {
  merchant: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
};

/** Everything non-adjustment for the week, Plaid + manual, newest
 * first. Fixed-obligation rows stay IN — a vet bill or a school fee is
 * part of the week's story even though it isn't discretionary. */
export async function readWeekTransactions(
  userId: string,
  householdId: string,
  fromIso: string,
  toIso: string,
): Promise<WeekTx[]> {
  const overrides = await loadUserOverrides(userId);
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({
        amount: plaidTransactions.amount,
        category: plaidTransactions.ourCategory,
        merchantName: plaidTransactions.merchantName,
        name: plaidTransactions.name,
        date: plaidTransactions.date,
      })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "accepted"),
          gte(plaidTransactions.date, fromIso),
          sql`${plaidTransactions.date} <= ${toIso}`,
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select({
        amount: expenses.amount,
        category: expenses.category,
        description: expenses.description,
        date: expenses.date,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          gte(expenses.date, fromIso),
          sql`${expenses.date} <= ${toIso}`,
          sql`${expenses.amount} > 0`,
        ),
      ),
  ]);

  const rows: WeekTx[] = [
    ...plaidRows.map((r) => ({
      merchant: (r.merchantName || r.name || "Unknown").trim(),
      category: r.category ?? "other",
      amount: r.amount,
      date: r.date,
    })),
    ...manualRows.map((r) => ({
      merchant: (r.description || "Manual entry").trim(),
      category: r.category ?? "other",
      amount: r.amount,
      date: r.date,
    })),
  ];
  return rows
    .filter((r) => bucketFor(r.category, overrides) !== "adjustment")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ─── Deterministic leakage finders ───────────────────────────────────
// The ONLY source of "avoid these xyz" content. Each finding is
// checkable against the transaction list the user can see.

export type LeakageItem = {
  kind: "fees" | "repeat_convenience" | "duplicate_charge";
  label: string;
  amount: number;
};

const FEE_CATEGORY = /fee|interest|service.?charge/i;
const FEE_NAME = /\bfee\b|\bsurcharge\b|\binterest charge\b|\bnsf\b|\boverdraft\b/i;

export function findFeeLeakage(txs: WeekTx[]): LeakageItem | null {
  const feeRows = txs.filter(
    (t) => FEE_CATEGORY.test(t.category) || FEE_NAME.test(t.merchant),
  );
  if (feeRows.length === 0) return null;
  const total = feeRows.reduce((s, t) => s + t.amount, 0);
  if (total < 5) return null; // sub-$5 isn't worth a sentence
  return {
    kind: "fees",
    label:
      feeRows.length === 1
        ? `a ${feeRows[0].merchant} charge`
        : `${feeRows.length} fee charges`,
    amount: Math.round(total),
  };
}

/** Same merchant ≥3 times in one week — the convenience-tax pattern
 * (delivery, rideshare, corner-store runs). Reported as a total so the
 * user sees the week's aggregate, not a scolding per order. */
export function findRepeatConvenience(txs: WeekTx[]): LeakageItem | null {
  const byMerchant = new Map<string, WeekTx[]>();
  for (const t of txs) {
    const key = t.merchant.toLowerCase();
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), t]);
  }
  let best: { merchant: string; rows: WeekTx[] } | null = null;
  for (const [, rows] of byMerchant) {
    if (rows.length < 3) continue;
    if (!best || rows.length > best.rows.length) {
      best = { merchant: rows[0].merchant, rows };
    }
  }
  if (!best) return null;
  const total = best.rows.reduce((s, t) => s + t.amount, 0);
  return {
    kind: "repeat_convenience",
    label: `${best.rows.length}× ${best.merchant}`,
    amount: Math.round(total),
  };
}

/** Same merchant, same amount, same day, more than once — a likely
 * double charge worth a refund conversation, not a budgeting lecture. */
export function findDuplicateCharges(txs: WeekTx[]): LeakageItem | null {
  const seen = new Map<string, WeekTx>();
  for (const t of txs) {
    const key = `${t.merchant.toLowerCase()}|${t.amount.toFixed(2)}|${t.date}`;
    if (seen.has(key)) {
      return {
        kind: "duplicate_charge",
        label: `${t.merchant} charged twice on ${t.date}`,
        amount: Math.round(t.amount),
      };
    }
    seen.set(key, t);
  }
  return null;
}

export function findLeakage(txs: WeekTx[]): LeakageItem[] {
  return [
    findDuplicateCharges(txs), // most actionable first — it's refundable
    findFeeLeakage(txs),
    findRepeatConvenience(txs),
  ].filter((x): x is LeakageItem => x !== null);
}

// ─── Narrative validation (pure, exported for tests) ─────────────────

/** Judgment vocabulary the narrative may never use about the user's
 * spending. The life-spend is affirmed or described, never sentenced. */
const JUDGMENT = /\bover.?budget\b|\boverspent\b|\bsplurg|\btoo much\b|\bguilt|\bshould(?:n't| not) have\b|\bsoft spot\b|\bstill\b/i;

export function validateNarrative(
  text: string,
  allowedFigures: Set<number>,
  incomeBlocked: boolean,
): { ok: boolean; reason?: string } {
  if (JUDGMENT.test(text)) return { ok: false, reason: "judgment vocabulary" };
  if (/^you spent \$/i.test(text.trim())) return { ok: false, reason: "deficit opener" };
  if (incomeBlocked && assertsSurplus(text)) {
    return { ok: false, reason: "surplus claim on unverified income" };
  }
  for (const fig of dollarFiguresIn(text)) {
    if (!allowedFigures.has(fig)) {
      return { ok: false, reason: `fabricated figure $${fig}` };
    }
  }
  return { ok: true };
}

/** Whole-dollar figures the narrative is allowed to cite: every tx,
 * every leakage total, the week totals and their delta, and small sums
 * of leakage items (so "about $61 across fees and the trial" passes). */
export function harvestAllowedFigures(input: {
  txs: WeekTx[];
  leakage: LeakageItem[];
  thisWeekTotal: number;
  priorWeekTotal: number;
}): Set<number> {
  const set = new Set<number>();
  const add = (n: number) => {
    set.add(Math.round(n));
    set.add(Math.floor(n));
    set.add(Math.ceil(n));
  };
  for (const t of input.txs) add(t.amount);
  for (const l of input.leakage) add(l.amount);
  add(input.thisWeekTotal);
  add(input.priorWeekTotal);
  add(Math.abs(input.thisWeekTotal - input.priorWeekTotal));
  // Pairwise sums of leakage items — "fees + the trial" phrasing.
  for (let i = 0; i < input.leakage.length; i++) {
    for (let j = i + 1; j < input.leakage.length; j++) {
      add(input.leakage[i].amount + input.leakage[j].amount);
    }
  }
  const leakTotal = input.leakage.reduce((s, l) => s + l.amount, 0);
  if (leakTotal > 0) add(leakTotal);
  return set;
}

// ─── The narrator ────────────────────────────────────────────────────

const NarrationSchema = z.object({
  storyConfidence: z
    .enum(["clear", "unclear"])
    .describe(
      "'clear' ONLY when the merchants and timing genuinely tell a recognizable life story (a kids-heavy week, a trip, a birthday, hosting family, a move). 'unclear' when the week is just ordinary mixed spending — guessing a story is worse than telling none.",
    ),
  storyLabel: z
    .string()
    .describe(
      "3-8 word label for what the week WAS, in life terms, not money terms. e.g. 'a kids-and-outings week', 'hosting week', 'back-to-school week'. Empty string when unclear.",
    ),
  narrative: z
    .string()
    .describe(
      "2-3 sentences for a push notification. Sentence 1: name the story and AFFIRM it — the money went where their life is, and that's worth it. No 'but'. Sentence 2-3: the leakage, as specifics from the provided list ONLY, framed as 'worth a look', never as a verdict on the week. If a leakage item is a duplicate charge, say it's likely refundable. Use ONLY dollar figures present in the data. Never open with 'You spent'.",
    ),
});

export type WeekNarration = {
  storyLabel: string;
  narrative: string;
  leakage: LeakageItem[];
};

/**
 * Try to narrate the week. Null means "no trustworthy story" — the
 * caller falls back to the deterministic composer. Never throws.
 */
export async function narrateWeek(input: {
  userId: string;
  householdId: string;
  weekStartIso: string;
  weekEndIso: string;
  thisWeekTotal: number;
  priorWeekTotal: number;
  incomeBlocked: boolean;
}): Promise<WeekNarration | null> {
  try {
    const txs = await readWeekTransactions(
      input.userId,
      input.householdId,
      input.weekStartIso,
      input.weekEndIso,
    );
    // A story needs texture. A 3-transaction week is a ledger, not a life.
    if (txs.length < 5) return null;

    const leakage = findLeakage(txs);

    const [lifeRows, memRows, dossier] = await Promise.all([
      db
        .select()
        .from(tillyLifeContext)
        .where(eq(tillyLifeContext.householdId, input.householdId))
        .orderBy(desc(tillyLifeContext.createdAt))
        .limit(1),
      db
        .select({ body: tillyMemory.body })
        .from(tillyMemory)
        .where(eq(tillyMemory.userId, input.userId))
        .orderBy(desc(tillyMemory.noticedAt))
        .limit(5),
      getLatestDossier(input.userId).catch(() => null),
    ]);
    const life = lifeRows[0];

    const txLines = txs
      .slice(0, 30)
      .map((t) => `${t.date} · ${t.merchant} · ${t.category} · $${t.amount.toFixed(0)}`)
      .join("\n");

    const userContent = `Read this week's transactions as a week in a person's LIFE, then write the notification.

Who they are:
${dossier ? formatDossierForPrompt(dossier.content) : "(no dossier yet)"}
${life ? `Life context: ${[life.dependents ? `${life.dependents} dependent(s)` : null, life.ageBand, life.city, life.supportNote].filter(Boolean).join(" · ")}` : ""}
${memRows.length ? `Recent observations:\n${memRows.map((m) => `- ${m.body}`).join("\n")}` : ""}

This week (${input.weekStartIso} → ${input.weekEndIso}), total $${Math.round(input.thisWeekTotal)} vs $${Math.round(input.priorWeekTotal)} the week before:
${txLines}

Leakage found by deterministic checks (the ONLY leakage you may mention — phrase these, do not invent others):
${leakage.length ? leakage.map((l) => `- ${l.label}: $${l.amount} (${l.kind})`).join("\n") : "(none found — then the narrative has no leakage sentence)"}

Rules:
- The life-spend is NEVER criticized. If the story is kids/family/friends/travel, the first sentence affirms it plainly.
- Leakage sentences reference ONLY the list above, with its numbers.
- Use ONLY dollar figures present in this message.${input.incomeBlocked ? "\n- Income is unverified: do NOT claim they have room, surplus, or can afford anything." : ""}
- If the merchants don't add up to a recognizable story, return storyConfidence: "unclear" — that is a good answer, not a failure.`;

    const llm = await getLLM();
    const out = await llm.structuredOutput<z.infer<typeof NarrationSchema>>({
      systemPrompts: [
        "You are Tilly, a financial companion who reads transactions the way a close friend reads a calendar — as evidence of a life being lived. You are warm, specific, and never judgmental about spending that maps to living. You are precise about friction costs (fees, duplicates, convenience premiums) because naming them is a kindness, not a criticism.",
      ],
      messages: [{ role: "user", content: userContent }],
      schema: NarrationSchema,
      schemaName: "week_narration",
      meta: { userId: input.userId, route: "week-narrator" },
    });

    if (out.storyConfidence !== "clear" || !out.narrative.trim()) return null;

    const allowed = harvestAllowedFigures({
      txs,
      leakage,
      thisWeekTotal: input.thisWeekTotal,
      priorWeekTotal: input.priorWeekTotal,
    });
    const verdict = validateNarrative(out.narrative, allowed, input.incomeBlocked);
    if (!verdict.ok) {
      console.warn(`[week-narrator] narrative rejected (${verdict.reason}) — falling back`);
      return null;
    }

    return { storyLabel: out.storyLabel, narrative: out.narrative, leakage };
  } catch (err) {
    console.warn("[week-narrator] failed, falling back to composer:", err);
    return null;
  }
}
