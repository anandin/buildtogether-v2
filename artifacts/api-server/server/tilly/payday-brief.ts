/**
 * Payday Pulse — the payday-triggered cycle brief.
 *
 * The calendar month is the wrong frame for a biweekly earner: rent and
 * bills don't care which paycheck covers them, and "projected close"
 * answers a question nobody asks on the 14th. The question a biweekly
 * earner actually has is: *this paycheck just landed — how much of it is
 * already spoken for before the next one, and how much is truly mine?*
 *
 * So, the moment a paycheck lands (detected from typical income rows —
 * the same cadence-clean set income-summary projects from, so a $70k
 * one-off can never masquerade as a payday), Tilly:
 *
 *   1. Computes the CYCLE ledger: known bills due before the next
 *      projected paycheck + expected variable burn at the user's
 *      trailing pace → "truly yours" remainder.
 *   2. Suggests a concrete dream sweep sized off the remainder
 *      (pay-yourself-first, but with honest math behind the number).
 *   3. Pushes ONE notification with the split inline (the value is in
 *      the notification body — no "tap to see more" bait), and writes
 *      an observation memory so Home + chat both know about it.
 *
 * Numbers are computed in code; the LLM only phrases. If the LLM is
 * down, a deterministic template ships instead — payday doesn't wait.
 *
 * Idempotent per (user, paydayDate) via the tilly_nudges context, so
 * the hourly cron can retry safely all day.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import {
  expenses,
  goals,
  households,
  plaidTransactions,
  subscriptions,
  tillyMemory,
  tillyNudges,
  tillyTonePref,
  users,
} from "../../shared/schema";
import {
  type IncomeCadence,
  dedupeIncomeRows,
  inferCadence,
  readIncomeRows,
  splitAnomalousIncome,
} from "./income-summary";
import { bucketFor, loadUserOverrides } from "./taxonomy";
import { getUserTimezone, localDateString, localDaysAgoIso } from "./user-tz";
import { sendExpoPush } from "./expo-push";
import { recordNudgeSent } from "./nudge-log";
import { getLLM } from "./llm/factory";
import { buildSystemPrompts } from "./persona";
import type { BTToneKey } from "./tone";

// ── Pure allocation math (unit-tested) ───────────────────────────────

export type CycleBill = { merchant: string; amount: number; date: string };

export type PaydayAllocation = {
  paycheckAmount: number;
  paydayDate: string;
  /** Projected from cadence; null when cadence is irregular/unknown. */
  nextPaydayDate: string | null;
  /** Days in this pay cycle (payday → next payday), 14 fallback. */
  cycleDays: number;
  billsDue: CycleBill[];
  billsTotal: number;
  /** Trailing variable pace × cycleDays. */
  expectedVariable: number;
  /** paycheck − bills − expected variable. Can be negative. */
  trulyFree: number;
  /** Concrete sweep suggestion, or null when there's no room / no dream. */
  dreamSuggestion: { goalId: string; name: string; amount: number } | null;
};

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function cadenceStepDays(cadence: IncomeCadence): number | null {
  return cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : cadence === "monthly" ? 30 : null;
}

export function computePaydayAllocation(input: {
  paycheckAmount: number;
  paydayDate: string;
  cadence: IncomeCadence;
  billsDue: CycleBill[];
  /** Trailing daily variable spend (dollars/day). */
  dailyPace: number;
  dream: { id: string; name: string; targetAmount: number; savedAmount: number } | null;
}): PaydayAllocation {
  const step = cadenceStepDays(input.cadence);
  const nextPaydayDate = step ? addDaysIso(input.paydayDate, step) : null;
  const cycleDays = step ?? 14;

  const billsTotal = Math.round(input.billsDue.reduce((s, b) => s + b.amount, 0));
  const expectedVariable = Math.round(input.dailyPace * cycleDays);
  const trulyFree = Math.round(input.paycheckAmount - billsTotal - expectedVariable);

  // Dream sweep: 10% of the truly-free remainder, rounded DOWN to $25
  // steps so the number reads intentional, capped at what the dream
  // still needs. Below $100 free we don't suggest — a $5 sweep nudge
  // reads as mockery when the cycle is tight.
  let dreamSuggestion: PaydayAllocation["dreamSuggestion"] = null;
  if (input.dream && trulyFree >= 100) {
    const remainingToTarget = Math.max(
      0,
      Math.round(input.dream.targetAmount - input.dream.savedAmount),
    );
    const tenPercent = Math.floor((trulyFree * 0.1) / 25) * 25;
    const amount = Math.min(Math.max(25, tenPercent), remainingToTarget);
    if (amount >= 25 && remainingToTarget > 0) {
      dreamSuggestion = { goalId: input.dream.id, name: input.dream.name, amount };
    }
  }

  return {
    paycheckAmount: Math.round(input.paycheckAmount * 100) / 100,
    paydayDate: input.paydayDate,
    nextPaydayDate,
    cycleDays,
    billsDue: input.billsDue,
    billsTotal,
    expectedVariable,
    trulyFree,
    dreamSuggestion,
  };
}

/** Deterministic push copy — also the fallback when the LLM is down. */
export function templatePushBody(a: PaydayAllocation): string {
  const free = a.trulyFree;
  const nextBit = a.nextPaydayDate
    ? ` before your ${a.nextPaydayDate.slice(5).replace("-", "/")} paycheck`
    : " this cycle";
  if (free >= 0) {
    return `Paycheck landed: $${Math.round(a.paycheckAmount).toLocaleString()}. ~$${(a.billsTotal + a.expectedVariable).toLocaleString()} is spoken for${nextBit} — about $${free.toLocaleString()} is truly yours.`;
  }
  return `Paycheck landed: $${Math.round(a.paycheckAmount).toLocaleString()}. Heads up — bills + your usual pace run ~$${Math.abs(free).toLocaleString()} past it${nextBit}. Worth a look together.`;
}

// ── LLM phrasing ─────────────────────────────────────────────────────

const PulsePhrasingSchema = z.object({
  pushBody: z
    .string()
    .describe(
      "ONE sentence push notification (max ~180 chars) with the split INLINE: paycheck amount, what's spoken for, what's truly theirs. Use the provided numbers verbatim. No emoji, no 'tap to see more' bait — the number IS the value.",
    ),
  cardBody: z
    .string()
    .describe(
      "2-3 sentence in-app version. Name the biggest bill in the cycle and the dream sweep suggestion if present. Tilly voice, plain prose, numbers verbatim, no emoji.",
    ),
});

async function phrasePulse(
  a: PaydayAllocation,
  tone: BTToneKey,
): Promise<{ pushBody: string; cardBody: string }> {
  const fallback = {
    pushBody: templatePushBody(a),
    cardBody:
      templatePushBody(a) +
      (a.dreamSuggestion
        ? ` Want me to move $${a.dreamSuggestion.amount} toward ${a.dreamSuggestion.name}?`
        : ""),
  };
  try {
    const llm = await getLLM();
    const systemPrompts = await buildSystemPrompts(tone);
    const phrasing = await llm.structuredOutput<z.infer<typeof PulsePhrasingSchema>>({
      systemPrompts,
      messages: [
        {
          role: "user",
          content: `A paycheck just landed. Phrase the Payday Pulse using these computed numbers VERBATIM (do not recompute):\n${JSON.stringify(
            {
              paycheck: a.paycheckAmount,
              paydayDate: a.paydayDate,
              nextPaydayDate: a.nextPaydayDate,
              cycleDays: a.cycleDays,
              billsDueThisCycle: a.billsDue.slice(0, 6),
              billsTotal: a.billsTotal,
              expectedVariableAtUsualPace: a.expectedVariable,
              trulyFree: a.trulyFree,
              dreamSweepSuggestion: a.dreamSuggestion,
            },
            null,
            2,
          )}`,
        },
      ],
      schema: PulsePhrasingSchema,
      schemaName: "payday_pulse",
      meta: { route: "payday-pulse" },
    });
    // Guard: every dollar figure in the push must exist in the
    // allocation — the daily-brief bug taught us never to trust
    // phrasing over math. Fall back to the template on any mismatch.
    const allowed = new Set<number>();
    for (const n of [
      a.paycheckAmount,
      a.billsTotal,
      a.expectedVariable,
      a.billsTotal + a.expectedVariable,
      Math.abs(a.trulyFree),
      a.dreamSuggestion?.amount ?? -1,
      ...a.billsDue.map((b) => b.amount),
    ]) {
      // Accept floor/round/ceil so "$6,744" and "$6,745" both pass for
      // a $6,744.58 paycheck — the guard is for fabrication, not for
      // rounding style.
      allowed.add(Math.floor(n));
      allowed.add(Math.round(n));
      allowed.add(Math.ceil(n));
    }
    const numbersIn = (s: string): number[] =>
      [...s.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)].map((m) =>
        Math.round(parseFloat(m[1].replace(/,/g, ""))),
      );
    const suspicious = [...numbersIn(phrasing.pushBody), ...numbersIn(phrasing.cardBody)].some(
      (n) => !allowed.has(n),
    );
    if (suspicious) {
      console.warn("[payday-pulse] LLM phrasing contained a number not in the allocation — using template");
      return fallback;
    }
    return phrasing;
  } catch (err) {
    console.warn("[payday-pulse] LLM phrasing failed, using template:", err);
    return fallback;
  }
}

// ── Detection + orchestration ────────────────────────────────────────

async function resolveOwner(householdId: string): Promise<string | null> {
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.coupleId, householdId))
    .limit(1);
  return row[0]?.id ?? null;
}

/** Trailing-28d variable daily pace, honouring the user's taxonomy
 * overrides — same bucketing computeMonthFlow uses. */
async function trailingVariablePace(
  userId: string,
  householdId: string,
  now: Date,
  tz: string,
): Promise<number> {
  const sinceIso = localDaysAgoIso(now, tz, 28);
  const overrides = await loadUserOverrides(userId);
  const [plaidRows, manualRows] = await Promise.all([
    db
      .select({ amount: plaidTransactions.amount, category: plaidTransactions.ourCategory })
      .from(plaidTransactions)
      .where(
        and(
          eq(plaidTransactions.coupleId, householdId),
          eq(plaidTransactions.status, "accepted"),
          gte(plaidTransactions.date, sinceIso),
          sql`${plaidTransactions.amount} > 0`,
        ),
      ),
    db
      .select({ amount: expenses.amount, category: expenses.category, source: expenses.source })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          gte(expenses.date, sinceIso),
          sql`${expenses.amount} > 0`,
        ),
      ),
  ]);
  let variable = 0;
  for (const r of plaidRows) {
    const b = bucketFor((r.category ?? "").toLowerCase(), overrides);
    if (b === "variable") variable += r.amount;
  }
  for (const r of manualRows) {
    if (r.source === "plaid") continue;
    const b = bucketFor((r.category ?? "").toLowerCase(), overrides);
    if (b === "variable") variable += r.amount;
  }
  return variable / 28;
}

export async function runPaydayPulseAll(now: Date = new Date()): Promise<{
  households: number;
  paydaysDetected: number;
  briefsSent: number;
  pushed: number;
}> {
  const allHouseholds = await db.select({ id: households.id }).from(households).limit(1000);
  let paydaysDetected = 0;
  let briefsSent = 0;
  let pushed = 0;

  for (const h of allHouseholds) {
    try {
      const userId = await resolveOwner(h.id);
      if (!userId) continue;
      const tz = await getUserTimezone(userId);

      // Daytime gate — a payday detected by the 3am sync should greet
      // the user at breakfast, not wake them.
      const localHour = parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now),
        10,
      );
      if (localHour < 8 || localHour >= 21) continue;

      // Payday detection over the cadence-clean income set. Yesterday
      // counts too: Plaid often posts the deposit a few hours late, and
      // the brief is still relevant the morning after.
      const todayIso = localDateString(now, tz);
      const yesterdayIso = addDaysIso(todayIso, -1);
      const windowRows = await readIncomeRows(h.id, localDaysAgoIso(now, tz, 90));
      const { typical } = splitAnomalousIncome(dedupeIncomeRows(windowRows));
      // Paydays are paycheck-sized rows, not $0.50 interest credits —
      // require ≥ 25% of the largest typical row.
      const maxTypical = Math.max(...typical.map((r) => Math.abs(r.amount)), 0);
      const landed = typical
        .filter((r) => (r.date === todayIso || r.date === yesterdayIso) && Math.abs(r.amount) >= maxTypical * 0.25)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!landed) continue;
      paydaysDetected++;

      // Idempotency: one pulse per (user, paydayDate).
      const already = await db
        .select({ id: tillyNudges.id })
        .from(tillyNudges)
        .where(
          and(
            eq(tillyNudges.userId, userId),
            sql`${tillyNudges.context} ->> 'source' = 'payday_pulse'`,
            sql`${tillyNudges.context} ->> 'paydayDate' = ${landed.date}`,
          ),
        )
        .limit(1);
      if (already.length > 0) continue;

      // Cycle ledger inputs.
      const cadence = inferCadence(typical.map((r) => r.date));
      const step = cadenceStepDays(cadence);
      const cycleEndIso = step ? addDaysIso(landed.date, step) : addDaysIso(landed.date, 14);
      const subs = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.householdId, h.id), eq(subscriptions.status, "active")));
      const billsDue: CycleBill[] = subs
        .filter((s) => {
          const next = s.nextChargeAt?.slice(0, 10) ?? null;
          return next && next > landed.date && next <= cycleEndIso;
        })
        .map((s) => ({ merchant: s.merchant, amount: s.amount, date: s.nextChargeAt!.slice(0, 10) }))
        .sort((a, b) => b.amount - a.amount);

      const dailyPace = await trailingVariablePace(userId, h.id, now, tz);
      const dreamRow = await db
        .select()
        .from(goals)
        .where(eq(goals.coupleId, h.id))
        .orderBy(desc(goals.createdAt))
        .limit(1);
      const dream = dreamRow[0]
        ? {
            id: dreamRow[0].id,
            name: dreamRow[0].name,
            targetAmount: dreamRow[0].targetAmount,
            savedAmount: dreamRow[0].savedAmount,
          }
        : null;

      const allocation = computePaydayAllocation({
        paycheckAmount: Math.abs(landed.amount),
        paydayDate: landed.date,
        cadence,
        billsDue,
        dailyPace,
        dream,
      });

      const [userRow, tonePref] = await Promise.all([
        db
          .select({ expoPushToken: users.expoPushToken })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
        db.query.tillyTonePref.findFirst({ where: eq(tillyTonePref.userId, userId) }),
      ]);
      const phrasing = await phrasePulse(
        allocation,
        (tonePref?.tone as BTToneKey | undefined) ?? "sibling",
      );

      // In-app surface: observation memory → Home's learned card + chat
      // retrieval both see it without any client change.
      const [memRow] = await db
        .insert(tillyMemory)
        .values({
          userId,
          householdId: h.id,
          kind: "observation",
          body: phrasing.cardBody,
          source: "inferred",
          dateLabel: "Payday",
          isMostRecent: true,
        })
        .returning();

      await recordNudgeSent({
        userId,
        householdId: h.id,
        frame: "mental_accounting",
        channel: "push",
        body: phrasing.pushBody,
        context: {
          source: "payday_pulse",
          paydayDate: landed.date,
          allocation: allocation as unknown as Record<string, unknown>,
        },
        sourceTable: "tilly_memory",
        sourceId: memRow.id,
      });
      briefsSent++;

      const token = userRow[0]?.expoPushToken;
      if (token) {
        const ticket = await sendExpoPush({
          to: token,
          title: "Payday",
          body: phrasing.pushBody,
          data: { route: "home", kind: "payday_pulse", paydayDate: landed.date },
        });
        if (ticket?.status === "ok") pushed++;
      }
    } catch (err) {
      console.warn("[payday-pulse] household failed:", h.id, err);
    }
  }

  return { households: allHouseholds.length, paydaysDetected, briefsSent, pushed };
}
