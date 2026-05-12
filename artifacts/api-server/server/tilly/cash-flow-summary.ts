/**
 * Cash-flow summary — the timeline of money in + out that Tilly reads
 * before giving spend advice.
 *
 * Goal: every reply that involves "should I buy X" / "can I afford Y" /
 * "when can I pay Z" has Tilly already knowing
 *   - when the next paycheck lands and how big
 *   - what recurring obligations hit in the next 14 days
 *   - which credit cards are due, and when
 *
 * Without this, Tilly answers from balance + headline alone — and the
 * user has to remember to mention "yeah but rent is on the 1st." The
 * point of putting it in the system prompt is so Tilly proactively
 * surfaces timing risk ("your $1,800 rent posts in 4 days, after that
 * you'd be at $620 — buy after the next paycheck instead?").
 *
 * Cost: one income-cadence query + one subscriptions query + one
 * plaid_items query for accounts. ~50ms total. Fires per chat turn.
 * Cache scope is per-turn (no need to memoize across turns since the
 * data shifts daily).
 */
import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "../db";
import {
  plaidItems,
  plaidTransactions,
  subscriptions,
} from "../../shared/schema";
import { getUserTimezone, localDateString, localDaysAgoIso } from "./user-tz";

export type CashFlowSummary = {
  /** Plain-text block ready to splice into the system prompt. */
  text: string;
  /** True when we found enough data to produce a useful summary.
   * Caller can skip injection when false to keep the prompt tight. */
  hasData: boolean;
};

/** Build the per-turn cash-flow context block. Returns hasData=false
 * when there's no paycheck history AND no recurring obligations — at
 * that point the block would just be noise. */
export async function buildCashFlowSummary(
  userId: string | null,
  householdId: string,
  now: Date = new Date(),
): Promise<CashFlowSummary> {
  const tz = await getUserTimezone(userId);
  const todayIso = localDateString(now, tz);

  const lines: string[] = [];

  // ── Paychecks: last 90 days → project next 2 ──────────────────────
  const sinceIso = localDaysAgoIso(now, tz, 90);
  const incomeRows = await db
    .select({
      amount: plaidTransactions.amount,
      date: plaidTransactions.date,
      merchantName: plaidTransactions.merchantName,
      name: plaidTransactions.name,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.ourCategory, "income"),
        gte(plaidTransactions.date, sinceIso),
      ),
    );

  let nextPaydays: Array<{ date: string; amount: number; daysOut: number }> = [];
  let medianGap = 0;
  let lastPay: { date: string; amount: number; source: string } | null = null;

  if (incomeRows.length >= 2) {
    const sorted = [...incomeRows].sort((a, b) => a.date.localeCompare(b.date));
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1].date + "T12:00:00Z").getTime();
      const d2 = new Date(sorted[i].date + "T12:00:00Z").getTime();
      gaps.push(Math.round((d2 - d1) / 86_400_000));
    }
    gaps.sort((a, b) => a - b);
    medianGap = gaps[Math.floor(gaps.length / 2)];

    const tail = sorted[sorted.length - 1];
    lastPay = {
      date: tail.date,
      amount: Math.abs(tail.amount),
      source: (tail.merchantName || tail.name || "paycheck").slice(0, 40),
    };

    if (medianGap >= 5 && medianGap <= 35) {
      // Project forward 2 paydays. Skip any that would land in the past
      // (e.g., last paycheck > medianGap ago means we missed one — most
      // likely a Plaid sync delay; we still report the next 2 forward
      // from today, not from the last-known date).
      let cursor = new Date(tail.date + "T12:00:00Z");
      const todayDate = new Date(todayIso + "T12:00:00Z");
      const seen = new Set<string>();
      while (nextPaydays.length < 2) {
        cursor.setUTCDate(cursor.getUTCDate() + medianGap);
        if (cursor < todayDate) continue;
        const iso = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
        if (seen.has(iso)) break;
        seen.add(iso);
        const days = Math.round(
          (cursor.getTime() - todayDate.getTime()) / 86_400_000,
        );
        nextPaydays.push({ date: iso, amount: tail.amount ? Math.abs(tail.amount) : 0, daysOut: days });
        if (nextPaydays.length >= 2) break;
        // Safety cap to avoid runaway loop in degenerate cadence data.
        if (cursor > new Date(todayDate.getTime() + 90 * 86_400_000)) break;
      }
    }
  }

  if (lastPay) {
    lines.push(
      `Last paycheck: ${lastPay.date} for $${Math.round(lastPay.amount).toLocaleString()} from ${lastPay.source}.`,
    );
  }
  if (medianGap) {
    const cadenceWord =
      medianGap <= 8 ? "weekly" :
        medianGap <= 16 ? "biweekly" :
          medianGap <= 32 ? "monthly" :
            `every ~${medianGap} days`;
    lines.push(`Paycheck cadence: ${cadenceWord} (median ${medianGap}d).`);
  }
  if (nextPaydays.length) {
    const projectionLines = nextPaydays.map(
      (p) =>
        `  - ${p.date} (in ${p.daysOut}d): ~$${Math.round(p.amount).toLocaleString()}`,
    );
    lines.push(`Next paychecks expected:\n${projectionLines.join("\n")}`);
  }

  // ── Recurring obligations in the next 14 days ─────────────────────
  const fourteenAhead = new Date(now);
  fourteenAhead.setDate(fourteenAhead.getDate() + 14);
  const fourteenAheadIso = localDateString(fourteenAhead, tz);

  const subs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.householdId, householdId),
        eq(subscriptions.status, "active"),
      ),
    );
  const upcomingSubs = subs
    .filter((s) => {
      if (!s.nextChargeAt) return false;
      const iso = s.nextChargeAt.slice(0, 10);
      return iso >= todayIso && iso <= fourteenAheadIso;
    })
    .sort((a, b) => (a.nextChargeAt ?? "").localeCompare(b.nextChargeAt ?? ""))
    .slice(0, 8);
  if (upcomingSubs.length) {
    const subsLines = upcomingSubs.map((s) => {
      const iso = (s.nextChargeAt ?? "").slice(0, 10);
      const daysOut = Math.max(
        0,
        Math.round(
          (new Date(iso + "T12:00:00Z").getTime() -
            new Date(todayIso + "T12:00:00Z").getTime()) /
            86_400_000,
        ),
      );
      return `  - ${iso} (in ${daysOut}d): ${s.merchant} $${Math.round(s.amount).toLocaleString()}`;
    });
    lines.push(`Recurring bills in the next 14 days:\n${subsLines.join("\n")}`);
  }

  // ── Credit-card accounts: list with last known balance ────────────
  // Heuristic — we don't currently pull Plaid Liabilities, so "due
  // date" isn't directly available. But we DO have the account type,
  // so we can at least name the cards. When the user asks "when is my
  // X card due", Tilly can say "I see your X card connected but
  // statement dates aren't in your data yet — what's the cycle?".
  // Cheap value: list the cards by name.
  const items = await db
    .select({
      id: plaidItems.id,
      institutionName: plaidItems.institutionName,
    })
    .from(plaidItems)
    .where(
      and(
        eq(plaidItems.coupleId, householdId),
        eq(plaidItems.status, "active"),
      ),
    );
  if (items.length) {
    const cards = items
      .map((i) => i.institutionName)
      .filter((n): n is string => !!n);
    if (cards.length) {
      lines.push(
        `Connected institutions: ${cards.join(", ")}. (Statement due dates aren't synced via Plaid — ask the user when one comes up.)`,
      );
    }
  }

  const hasData = lines.length > 0;
  if (!hasData) {
    return { hasData, text: "" };
  }
  const text =
    `Their cash-flow timing (use when they ask about affording or timing a purchase — proactively reference upcoming paychecks vs. bills):\n${lines.join("\n")}`;
  return { hasData, text };
}
