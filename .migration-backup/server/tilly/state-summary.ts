/**
 * Snapshot of the user's current financial state — fed into the chat
 * prompt as a system note so Tilly can answer questions like "how's my
 * money doing?" with real numbers instead of asking the user to connect.
 *
 * Pulls from:
 *   - plaid_items + plaid_transactions (real bank data)
 *   - expenses (manual + photo + voice entries)
 *   - subscriptions (recurring + manually added)
 *   - protections (recent flags)
 *   - goals (active dreams)
 *
 * Output is plaintext (no JSON) so the LLM treats it as context, not as
 * structured data to reformat. Ordered shortest-first so the prompt
 * stays readable when the model echoes parts back.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  expenses,
  goals,
  households,
  plaidItems,
  plaidTransactions,
  protections,
  subscriptions,
} from "../../shared/schema";
import { buildWeeklyPattern } from "./spend-pattern";

export type FinancialStateSummary = {
  /** Plaintext summary; ~150-300 chars typical. */
  text: string;
  /** Was anything actually populated? Used to gate "I'm flying blind" responses. */
  hasData: boolean;
};

/**
 * Build the financial-state summary for a household. Best-effort —
 * any sub-query failure logs and continues so a partial outage in one
 * source doesn't blank out the whole context.
 */
export async function buildFinancialStateSummary(
  householdId: string,
): Promise<FinancialStateSummary> {
  const lines: string[] = [];
  let hasData = false;

  // 1. Plaid connection state
  try {
    const items = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.coupleId, householdId), eq(plaidItems.status, "active")))
      .limit(5);
    if (items.length > 0) {
      const names = items.map((i) => i.institutionName ?? "a bank").join(", ");
      lines.push(`Bank: connected to ${names}.`);
      hasData = true;
    } else {
      lines.push("Bank: not connected (yet — they may have added expenses manually).");
    }
  } catch {}

  // 2. This-week spend + soft spot via the existing pattern engine
  try {
    const pattern = await buildWeeklyPattern(householdId);
    if (pattern && pattern.ready === true) {
      lines.push(
        `This week: $${pattern.spent} spent. ${pattern.italicSpan ? `Soft spot: ${pattern.italicSpan}.` : "No soft-spot pattern detected yet."}`,
      );
      if (pattern.categories?.length) {
        const top = pattern.categories
          .slice(0, 4)
          .map((c) => `${c.name} $${c.amt}${c.softSpot ? " (soft spot)" : ""}`)
          .join(", ");
        lines.push(`Top categories: ${top}.`);
      }
      hasData = true;
    }
  } catch {}

  // 3. Manual-entry recent count (separate from Plaid pattern)
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const manual = await db
      .select({ amount: expenses.amount })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, householdId),
          gte(expenses.date, sevenDaysAgo),
          sql`${expenses.source} != 'plaid'`,
        ),
      );
    if (manual.length > 0) {
      const sum = Math.round(manual.reduce((s, r) => s + r.amount, 0));
      lines.push(`Manual entries this week: ${manual.length} totaling $${sum}.`);
      hasData = true;
    }
  } catch {}

  // 4. Active dreams
  try {
    const dreams = await db
      .select({ name: goals.name, saved: goals.savedAmount, target: goals.targetAmount, weekly: goals.weeklyAuto })
      .from(goals)
      .where(eq(goals.coupleId, householdId))
      .limit(5);
    if (dreams.length > 0) {
      const text = dreams
        .map((d) => `${d.name} ($${Math.round(d.saved ?? 0)}/$${Math.round(d.target ?? 0)}${d.weekly ? `, +$${d.weekly}/wk` : ""})`)
        .join(", ");
      lines.push(`Active dreams: ${text}.`);
      hasData = true;
    }
  } catch {}

  // 5. Active subscriptions (high-signal for chat questions)
  try {
    const subs = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.householdId, householdId), eq(subscriptions.status, "active")))
      .limit(8);
    if (subs.length > 0) {
      const text = subs
        .map((s) => `${s.merchant} $${s.amount.toFixed(0)}/${s.cadence}${s.usageNote ? ` — ${s.usageNote}` : ""}`)
        .join(", ");
      lines.push(`Subscriptions: ${text}.`);
      hasData = true;
    }
  } catch {}

  // 6. Open protections (act_today first, then decision_needed)
  try {
    const flags = await db
      .select()
      .from(protections)
      .where(and(eq(protections.householdId, householdId), eq(protections.status, "flagged")))
      .orderBy(desc(protections.flaggedAt))
      .limit(5);
    if (flags.length > 0) {
      const text = flags.map((f) => `${f.severity}: ${f.summary}`).join("; ");
      lines.push(`Open flags: ${text}.`);
      hasData = true;
    }
  } catch {}

  if (!hasData) {
    return {
      text: "I have no record of their accounts or expenses yet — they may have just signed up.",
      hasData: false,
    };
  }
  return {
    text: lines.join("\n"),
    hasData: true,
  };
}
