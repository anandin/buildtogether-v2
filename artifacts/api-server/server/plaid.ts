/**
 * Plaid integration helpers.
 *
 * Feature-flagged: if PLAID_CLIENT_ID is not set, the endpoints still mount but
 * return 503 with a friendly error, and the client-side PlaidConnectButton
 * shows a "coming soon" state instead of attempting the Link flow.
 *
 * Category mapping: Plaid returns a hierarchy like ["Food and Drink", "Restaurants"].
 * We flatten it to our 13 internal ExpenseCategory values.
 */
// The api-server runs as ESM under tsx, so `require()` is not defined here.
// Use a static ESM import for the Plaid SDK; tree-shaking isn't a concern
// for a server module and lazy-loading bought us nothing because the
// Plaid endpoints are mounted at boot.
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from "plaid";

let _plaidClient: PlaidApi | null = null;
let _initAttempted = false;

/**
 * Active Plaid environment ("sandbox" | "development" | "production").
 * Defaults to sandbox when unset so a half-configured deployment doesn't
 * silently hit production with the wrong creds.
 */
export function getPlaidEnv(): string {
  return (process.env.PLAID_ENV || "sandbox").toLowerCase();
}

/**
 * OAuth redirect URI to hand to Plaid Link. Required for production banks
 * that use OAuth (Chase, Wells Fargo, Capital One, BofA, etc.) — Plaid
 * rejects the link-token request if the URI isn't pre-registered on their
 * dashboard. Returns undefined when unset (sandbox skips OAuth banks).
 */
export function getPlaidRedirectUri(): string | undefined {
  const v = process.env.PLAID_REDIRECT_URI;
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Active Plaid client_id / secret pair.
 *
 * Why two name shapes: Replit env vars (production-scoped) live in
 * `.replit` in plaintext (committed to git), so we can't store a real
 * production secret there. Replit secrets ARE safe but are global
 * (not env-scoped), which means dev would inherit them. To get the
 * best of both, we keep dev/sandbox values in the un-prefixed
 * PLAID_CLIENT_ID / PLAID_SECRET globals and store the production
 * pair under PLAID_PRODUCTION_CLIENT_ID / PLAID_PRODUCTION_SECRET.
 * When PLAID_ENV=production, we prefer the prefixed pair; otherwise
 * we fall back to the plain names. This keeps dev on sandbox without
 * any production secret ever touching `.replit`.
 */
function getPlaidCreds(): { clientId?: string; secret?: string } {
  const env = getPlaidEnv();
  if (env === "production") {
    return {
      clientId:
        process.env.PLAID_PRODUCTION_CLIENT_ID || process.env.PLAID_CLIENT_ID,
      secret:
        process.env.PLAID_PRODUCTION_SECRET || process.env.PLAID_SECRET,
    };
  }
  return {
    clientId: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
  };
}

export function isPlaidConfigured(): boolean {
  // Boot-time env-validation.ts already rejects the half-configured case
  // (one of CLIENT_ID / SECRET set without the other), so by the time we
  // reach a request handler this is a clean either-on-or-off check.
  const { clientId, secret } = getPlaidCreds();
  return !!(clientId && secret);
}

export function getPlaidClient(): PlaidApi | null {
  if (_plaidClient) return _plaidClient;
  if (_initAttempted) return null; // already tried and failed
  _initAttempted = true;

  if (!isPlaidConfigured()) return null;

  try {
    const env = getPlaidEnv();
    const basePath =
      (PlaidEnvironments as Record<string, string>)[env] ||
      PlaidEnvironments.sandbox;

    const { clientId, secret } = getPlaidCreds();
    const config = new Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId!,
          "PLAID-SECRET": secret!,
          "Plaid-Version": "2020-09-14",
        },
      },
    });

    _plaidClient = new PlaidApi(config);
    return _plaidClient;
  } catch (err) {
    console.error("Plaid init failed:", err);
    return null;
  }
}

/**
 * Map a Plaid category hierarchy (e.g. ["Food and Drink", "Restaurants"]) to
 * one of our internal ExpenseCategory values.
 *
 * Plaid's new "personal_finance_category" taxonomy uses snake_case like
 * "FOOD_AND_DRINK" / "GROCERIES". We accept both shapes.
 */
export function mapPlaidCategory(
  legacyCategory?: string[] | null,
  pfCategory?: { primary?: string; detailed?: string } | null,
  hints?: { name?: string | null; merchantName?: string | null } | null,
): string {
  // Name-keyword overrides for stuff Plaid frequently mis-PFC's.
  const haystack = `${hints?.merchantName ?? ""} ${hints?.name ?? ""}`.toLowerCase();
  if (haystack) {
    // Tax remittance — sometimes PFC=null or a generic GOVERNMENT category,
    // but user recognizes as taxes regardless.
    if (/\b(cra|irs|tax(es|cdn)?|txd|hst remit|gst remit|property tax|bramptax)/.test(haystack)) {
      return "taxes";
    }
    // Charge cards & credit-card payment names. Diners Club, Amex, etc.
    // sometimes come back as GENERAL_SERVICES (→ subscriptions) when
    // they're really credit-card pay-downs. The user's Diners Club $4091
    // landed in subscriptions instead of loans, dominating Monday's bar.
    if (
      /\b(diners club|amex(?!\s*statement)|charge card)\b/.test(haystack) ||
      /\b(visa|mastercard|m\/?card)\s+(pmt|payment|preauth|w[a-z0-9]+)\b/.test(haystack)
    ) {
      return "loans";
    }
    // Insurance carriers — Plaid frequently lands these under
    // GENERAL_SERVICES (→ subscriptions) which makes the spend page
    // misleading. The user's Pembridge auto policy was the trigger;
    // these are the most common Canadian + US carriers.
    if (
      /\b(pembridge|allstate|state farm|geico|progressive|travelers|nationwide|liberty mutual|farmers|aviva|intact|manulife|sun ?life|td insurance|belairdirect|economical|the co-?operators|desjardins insurance|wawanesa|gore mutual|primerica)\b/.test(
        haystack,
      ) ||
      /\binsurance\b/.test(haystack)
    ) {
      return "insurance";
    }
  }

  // Prefer the new personal_finance_category when Plaid provides it.
  if (pfCategory?.detailed || pfCategory?.primary) {
    const detailed = (pfCategory.detailed || "").toUpperCase();
    const primary = (pfCategory.primary || "").toUpperCase();

    if (detailed.includes("GROCERIES") || detailed === "FOOD_AND_DRINK_GROCERIES") return "groceries";
    if (primary === "FOOD_AND_DRINK") return "restaurants";
    if (primary === "TRANSPORTATION" || detailed.includes("GAS")) return "transport";
    if (primary === "TRAVEL") return "transport";
    if (primary === "ENTERTAINMENT") return "entertainment";
    if (primary === "RENT_AND_UTILITIES" || detailed.includes("UTILITIES")) return "utilities";
    if (detailed.includes("INTERNET") || detailed.includes("CABLE")) return "utilities";
    if (primary === "MEDICAL") return "health";
    if (primary === "PERSONAL_CARE") return "personal";
    if (primary === "GENERAL_MERCHANDISE") return "shopping";
    if (primary === "HOME_IMPROVEMENT") return "shopping";
    // Insurance has its own detailed PFC; map it before the broader
    // GENERAL_SERVICES → subscriptions catch-all so auto/home/health
    // policies don't pollute the subscriptions bucket.
    if (detailed.includes("INSURANCE")) return "insurance";
    if (primary === "GENERAL_SERVICES") return "subscriptions";
    // CRA, IRS, property tax (Bramptaxes etc.) — was disappearing into
    // "other". Peeling out so the user sees "$5K to tax this quarter"
    // instead of an undifferentiated $23K bucket.
    if (primary === "GOVERNMENT_AND_NON_PROFIT") return "taxes";
    // Loan payments are real spend from the user's POV — car loans, student
    // loans, credit-card pay-downs all reduce the bank balance. Show them
    // under their own bucket instead of dumping into "other".
    if (primary === "LOAN_PAYMENTS") return "loans";
    // Money moved between own accounts (savings deposits, e-transfer to
    // self). Conceptually NOT spending, but the user still wants to see
    // where the money went rather than have it vanish into "other".
    if (primary === "TRANSFER_OUT") return "transfers";

    // TRANSFER_IN — money coming in. Plaid uses this primary for a wide
    // variety of inflows, MANY of which are real income that we
    // previously dropped on the floor: Canadian banks (TD, RBC, Tangerine)
    // commonly emit TRANSFER_IN.DEPOSIT for direct-deposit payroll
    // instead of INCOME.WAGES. Route by detailed sub-category so deposits
    // land in the right bucket. Anything we can't classify defaults to
    // 'income' — the user can move it to transfers/cashback via the
    // Cash Flow page if it's actually a wash.
    if (primary === "TRANSFER_IN") {
      if (
        detailed.includes("PAYROLL") ||
        detailed.includes("DEPOSIT") ||
        detailed.includes("CASH_ADVANCES_AND_LOANS")
      ) return "income";
      if (detailed.includes("TAX_REFUND") || detailed.includes("RETURNED_PURCHASE"))
        return "credit_adjustment";
      if (detailed.includes("CASHBACK") || detailed.includes("REWARDS"))
        return "cashback";
      if (
        detailed.includes("ACCOUNT_TRANSFER") ||
        detailed.includes("INVESTMENT_AND_RETIREMENT_FUNDS") ||
        detailed.includes("SAVINGS")
      ) return "transfers";
      // Unknown TRANSFER_IN variant — default to income so we never
      // silently lose a deposit. User can reclassify if it's not real.
      return "income";
    }

    // Bank/account fees are tiny but worth tracking — students notice them.
    if (primary === "BANK_FEES") return "fees";
    // Income — paychecks + gig payments. Used by /api/tilly/monthly-summary
    // to surface "you earned $X this month".
    if (primary === "INCOME") return "income";
  }

  // Fallback to legacy category array
  if (legacyCategory && legacyCategory.length > 0) {
    const top = legacyCategory[0]?.toLowerCase() || "";
    const sub = legacyCategory[1]?.toLowerCase() || "";

    if (top === "food and drink") {
      if (sub.includes("grocer") || sub.includes("supermarket")) return "groceries";
      return "restaurants";
    }
    if (top === "travel") return "transport";
    if (top === "transportation") return "transport";
    if (top === "shops") return "shopping";
    if (top === "recreation" || top === "entertainment") return "entertainment";
    if (top === "healthcare") return "health";
    if (top === "service" || top === "payment") return "subscriptions";
    if (top.includes("utility") || top.includes("utilities")) return "utilities";
  }

  return "other";
}

/**
 * Determine if a Plaid transaction is one we should import.
 * We import: outgoing expenses (user-initiated debits) AND incoming
 * paychecks/income (so Tilly can compute monthly income vs spend).
 * We skip: transfers between user's own accounts, refunds.
 *
 * Sign convention: Plaid uses positive=outflow, negative=inflow.
 * Income rows land with negative amount and ourCategory='income';
 * existing expense queries filter `amount > 0` so income rows are
 * invisible to spend totals while remaining queryable for the
 * monthly-summary endpoint.
 */
export function shouldImportPlaidTransaction(
  tx: { amount: number; category?: string[] | null; personal_finance_category?: any },
): boolean {
  if (tx.amount === 0) return false;
  const primary = (tx.personal_finance_category?.primary || "").toUpperCase();

  // Income — paychecks, direct deposits, gig payments. Keep so we can
  // surface monthly take-home and compute surplus on Home.
  if (primary === "INCOME") return tx.amount < 0; // sanity: must be inflow

  // TRANSFER_OUT — outgoing internal moves (savings deposit, paying own
  // card from own checking). Skip when we have the matching inflow on
  // the other side, but allow when it's the only signal we have. Today
  // we drop them; user-facing "transfers" bucket is fed by TRANSFER_IN
  // classification + manual reclassification via the Cash Flow page.
  if (primary === "TRANSFER_OUT") return false;

  // TRANSFER_IN — keep. mapPlaidCategory routes the row to income /
  // cashback / credit_adjustment / transfers based on detailed PFC.
  // We previously dropped ALL TRANSFER_IN rows here, which silently
  // erased Canadian payroll deposits (often TRANSFER_IN.DEPOSIT) and
  // tax refunds. The user's "$24k earned but only 2 line items"
  // perception was real — the other paychecks landed as TRANSFER_IN
  // and got filtered before reaching the database.
  if (primary === "TRANSFER_IN") return true;

  // Legacy category fallback for OUT transfers + payments (no PFC).
  const top = (tx.category?.[0] || "").toLowerCase();
  if (top === "transfer" && tx.amount > 0) return false; // outflow only
  if (top === "payment" && tx.amount > 0) return false;

  // Any remaining inflow (amount < 0) without PFC at all — let it
  // through. mapPlaidCategory defaults to "other" for these. The user
  // can reclassify if it's actually income/cashback/etc. The cost of
  // a noisy "other" row is much lower than the cost of silently losing
  // a paycheck.
  return true;
}

/**
 * Threshold above which a transaction is sent to the human review queue
 * regardless of category. Anything ≤ this auto-accepts into the spend feed
 * (subject to the noisy-category checks below).
 */
export const AUTO_ACCEPT_AMOUNT_CAP = 500;

/**
 * Decide whether a Plaid transaction is "clearly a normal purchase" we can
 * silently fold into the household ledger, vs. something the user should eyeball.
 *
 * Sent to review (return false) when ANY of:
 *   - amount > AUTO_ACCEPT_AMOUNT_CAP (could be a big one-off the user wants to
 *     classify deliberately — rent, tuition, large electronics, etc.)
 *   - category looks like fees / interest / loan / transfer / payment-to-self
 *     (these distort the spend picture and aren't really discretionary spend)
 *   - the merchant name contains keywords that historically appear on noisy
 *     items even when Plaid can't categorize them (INTEREST CHARGES, NSF FEE,
 *     CARD PAYMENT, E-TRANSFER, etc.)
 *
 * Otherwise auto-accept. Caller should already have run
 * shouldImportPlaidTransaction() first to filter out income/refunds.
 */
/**
 * Complementary path to shouldAutoAcceptPlaidTransaction: when Tilly's
 * classifier returns a very-high-confidence answer on a tiny or fee-shaped
 * row, skip the Pending queue entirely. The user said it explicitly: "Annual
 * Fee at 0.95 confidence, Withdrawal Fees at 0.95 — these don't need user
 * review." Bigger or lower-confidence rows still hit Pending so the user can
 * eyeball them.
 *
 * Returns true for:
 *   - confidence ≥ 0.9 AND amount < $30, OR
 *   - confidence ≥ 0.9 AND PFC primary = BANK_FEES
 *
 * Caller MUST also confirm the row isn't pending (Plaid still shaping it)
 * before honouring this. Same `tx.pending` guard the rule path uses.
 */
export function shouldAutoAcceptByAI(
  aiConfidence: number | null | undefined,
  tx: { amount: number; personal_finance_category?: any },
): boolean {
  if (typeof aiConfidence !== "number" || aiConfidence < 0.9) return false;
  const primary = (tx.personal_finance_category?.primary || "").toUpperCase();
  if (primary === "BANK_FEES") return true;
  if (Math.abs(tx.amount) < 30) return true;
  return false;
}

export function shouldAutoAcceptPlaidTransaction(
  tx: { amount: number; name?: string | null; merchant_name?: string | null; category?: string[] | null; personal_finance_category?: any },
): boolean {
  const primary = (tx.personal_finance_category?.primary || "").toUpperCase();

  // Income rows: always auto-accept. The user shouldn't have to
  // manually approve every paycheck — the monthly-summary endpoint
  // just needs them in the table. amount-cap doesn't apply (income
  // can be large) and we already gate by PFC=INCOME.
  if (primary === "INCOME") return true;

  // TRANSFER_IN: now also auto-accepted. mapPlaidCategory routes
  // these to income / cashback / credit_adjustment / transfers based
  // on detailed PFC. None of those bucket warrants manual approval —
  // paycheck-shaped deposits should not sit in a pending queue
  // demanding the user click 'accept' before they count as income.
  // amount-cap doesn't apply (paychecks are commonly > $500).
  if (primary === "TRANSFER_IN") return true;

  // Any other inflow (amount < 0) — auto-accept. Includes the case
  // where Plaid gave us no PFC at all but it's clearly money coming
  // in. The noisy-keyword filter below was built for outflow noise
  // (interest charges, wire-transfer fees out, etc.) — it shouldn't
  // gate deposits. If the user wanted a deposit reclassified they
  // can do it from the Cash Flow page; silently parking it in
  // pending was the cause of the "$24k earned but 2 line items"
  // bug.
  if (tx.amount < 0) return true;

  if (tx.amount > AUTO_ACCEPT_AMOUNT_CAP) return false;

  const detailed = (tx.personal_finance_category?.detailed || "").toUpperCase();
  if (
    primary === "BANK_FEES" ||
    primary === "LOAN_PAYMENTS" ||
    primary === "TRANSFER_OUT"
  ) return false;
  if (detailed.includes("INTEREST_CHARGE") || detailed.includes("OVERDRAFT") || detailed.includes("ATM_FEE")) return false;

  const top = (tx.category?.[0] || "").toLowerCase();
  if (top === "transfer" || top === "payment" || top === "bank fees" || top === "interest") return false;

  // Belt-and-suspenders: catch poorly-categorized noise by name keywords
  // (e.g. Scotiabank reports "INTEREST CHARGES CASH" as category=OTHER).
  const haystack = `${tx.name || ""} ${tx.merchant_name || ""}`.toLowerCase();
  const noisyKeywords = [
    "interest charge",
    "interest chrg",
    "nsf fee",
    "overdraft",
    "service charge",
    "service fee",
    "annual fee",
    "foreign transaction fee",
    "card payment",
    "credit card payment",
    "payment - thank you",
    "payment thank you",
    "e-transfer",
    "etransfer",
    "wire transfer",
    "loan payment",
    "mortgage payment",
  ];
  if (noisyKeywords.some((kw) => haystack.includes(kw))) return false;

  return true;
}
