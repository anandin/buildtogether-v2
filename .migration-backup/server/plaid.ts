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
import type { Configuration, PlaidApi } from "plaid";

let _plaidClient: PlaidApi | null = null;
let _initAttempted = false;

export function isPlaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function getPlaidClient(): PlaidApi | null {
  if (_plaidClient) return _plaidClient;
  if (_initAttempted) return null; // already tried and failed
  _initAttempted = true;

  if (!isPlaidConfigured()) return null;

  try {
    const {
      Configuration: ConfigClass,
      PlaidApi: ApiClass,
      PlaidEnvironments,
    } = require("plaid");

    const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
    const basePath = (PlaidEnvironments as any)[env] || PlaidEnvironments.sandbox;

    const config: Configuration = new ConfigClass({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
          "PLAID-SECRET": process.env.PLAID_SECRET!,
          "Plaid-Version": "2020-09-14",
        },
      },
    });

    _plaidClient = new ApiClass(config);
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
    if (primary === "LOAN_PAYMENTS") return "other";
    if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return "other";
    if (primary === "BANK_FEES") return "other";
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
