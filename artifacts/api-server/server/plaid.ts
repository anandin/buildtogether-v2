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
): string {
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
    if (primary === "GENERAL_SERVICES") return "subscriptions";
    if (primary === "GOVERNMENT_AND_NON_PROFIT") return "other";
    // Loan payments are real spend from the user's POV — car loans, student
    // loans, credit-card pay-downs all reduce the bank balance. Show them
    // under their own bucket instead of dumping into "other".
    if (primary === "LOAN_PAYMENTS") return "loans";
    if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return "other";
    // Bank/account fees are tiny but worth tracking — students notice them.
    if (primary === "BANK_FEES") return "fees";
    if (primary === "INCOME") return "other";
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
 * Determine if a Plaid transaction is an expense we should import.
 * We want: user-initiated debits (money leaving their account).
 * We skip: income/deposits, transfers between their own accounts, refunds.
 */
export function shouldImportPlaidTransaction(
  tx: { amount: number; category?: string[] | null; personal_finance_category?: any },
): boolean {
  // In Plaid: positive amount = money leaving the account (expense)
  //           negative amount = money entering the account (income/refund)
  if (tx.amount <= 0) return false;

  const primary = (tx.personal_finance_category?.primary || "").toUpperCase();
  if (primary === "INCOME" || primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return false;

  const top = (tx.category?.[0] || "").toLowerCase();
  if (top === "transfer" || top === "payment") return false;

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
export function shouldAutoAcceptPlaidTransaction(
  tx: { amount: number; name?: string | null; merchant_name?: string | null; category?: string[] | null; personal_finance_category?: any },
): boolean {
  if (tx.amount > AUTO_ACCEPT_AMOUNT_CAP) return false;

  const primary = (tx.personal_finance_category?.primary || "").toUpperCase();
  const detailed = (tx.personal_finance_category?.detailed || "").toUpperCase();
  if (
    primary === "BANK_FEES" ||
    primary === "LOAN_PAYMENTS" ||
    primary === "TRANSFER_IN" ||
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
