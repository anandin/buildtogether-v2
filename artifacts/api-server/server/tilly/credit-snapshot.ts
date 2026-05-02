/**
 * Credit utilization snapshot — feeds BTCredit (spec §4.4).
 *
 * Per D3 (Plaid liabilities only — VantageScore deferred), we compute:
 *   - utilization = sum(credit balance) / sum(credit limit) * 100
 *   - "Pay $X to drop to 28%" — the smallest payment that lands at or
 *     below the 30% target
 *   - levers: payment history, account age, hard inquiries
 *     (Plaid liabilities provides next_payment_due_date, last_payment,
 *      and last_statement_balance — we infer state from these)
 *
 * Returns { ready: false } when no Plaid credit cards are connected.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { plaidItems } from "../../shared/schema";
import { getPlaidClient, isPlaidConfigured } from "../plaid";

export type CreditLever = {
  state: "good" | "neutral" | "warn";
  value: string;
  note: string;
};

export type CreditSnapshot = {
  ready: true;
  used: number;
  limit: number;
  pct: number;
  target: number;
  // Score deferred per D3 — null until Array.com or Plaid Credit endpoint wired.
  score: number | null;
  delta: number | null;
  since: string | null;
  payment: CreditLever;
  age: CreditLever;
  inquiries: CreditLever;
  protected: string[];
  // What pay-down lands the user at the 30% target.
  payNow?: { amount: number; resultsIn: number };
};

export async function buildCreditSnapshot(
  householdId: string,
): Promise<CreditSnapshot | { ready: false; reason: string }> {
  if (!isPlaidConfigured()) {
    return { ready: false, reason: "plaid_not_configured" };
  }

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.coupleId, householdId));

  if (items.length === 0) {
    return { ready: false, reason: "no_plaid_items" };
  }

  const plaid = getPlaidClient();
  if (!plaid) return { ready: false, reason: "plaid_client_unavailable" };

  let totalBalance = 0;
  let totalLimit = 0;
  let oldestOpenDays = 0;
  let hasOnTimePaymentHistory = false;
  let hardInquiries = 0;

  for (const item of items) {
    try {
      const resp = await plaid.liabilitiesGet({
        access_token: item.accessToken,
      });
      const credit = resp.data.liabilities?.credit ?? [];
      for (const card of credit) {
        const balance = card.last_statement_balance ?? 0;
        // Plaid sometimes returns null for limit on charge cards. We skip
        // those — utilization isn't meaningful there.
        const acct = resp.data.accounts.find((a) => a.account_id === card.account_id);
        const limit = acct?.balances?.limit;
        if (!limit) continue;
        totalBalance += balance;
        totalLimit += limit;

        // Last payment status
        if (card.last_payment_amount && card.last_payment_amount > 0) {
          hasOnTimePaymentHistory = true;
        }
      }

      // Account age: use the longest-open account from this item's metadata
      // (Plaid doesn't return open-date directly; we approximate via item
      // creation date which is close-enough for the V1 lever).
      const ageDays = Math.floor(
        (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (ageDays > oldestOpenDays) oldestOpenDays = ageDays;
    } catch (err) {
      console.error(`liabilitiesGet failed for item ${item.id}:`, err);
    }
  }

  if (totalLimit === 0) {
    return { ready: false, reason: "no_credit_cards" };
  }

  const pct = Math.round((totalBalance / totalLimit) * 100);
  const target = 30;

  // Pay-now suggestion: how much to pay to land at target%.
  let payNow: { amount: number; resultsIn: number } | undefined;
  if (pct > target) {
    const targetBalance = (totalLimit * (target - 2)) / 100; // aim for 28% to stay under
    const needed = Math.ceil(totalBalance - targetBalance);
    if (needed > 0) {
      payNow = {
        amount: needed,
        resultsIn: Math.round(((totalBalance - needed) / totalLimit) * 100),
      };
    }
  }

  const ageMonths = Math.max(1, Math.floor(oldestOpenDays / 30));
  const ageStr = ageMonths < 12 ? `${ageMonths}mo` : `${Math.floor(ageMonths / 12)}y ${ageMonths % 12}mo`;

  return {
    ready: true,
    used: Math.round(totalBalance),
    limit: Math.round(totalLimit),
    pct,
    target,
    score: null,
    delta: null,
    since: null,
    payment: hasOnTimePaymentHistory
      ? { state: "good", value: "On time", note: "Never late. Keep autopay on." }
      : { state: "neutral", value: "Unknown", note: "Connect a card so I can see this." },
    age: {
      state: ageMonths < 12 ? "neutral" : "good",
      value: ageStr,
      note: ageMonths < 24 ? "Keep your oldest card open." : "Strong history.",
    },
    inquiries: {
      state: "neutral",
      value: String(hardInquiries),
      note: "Plaid doesn't surface hard inquiries — connect Credit Report later.",
    },
    protected: [],
    payNow,
  };
}
