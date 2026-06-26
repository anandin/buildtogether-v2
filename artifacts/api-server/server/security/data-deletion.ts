/**
 * Right-to-erasure data purge (GDPR Art. 17 / CCPA / SOC 2 Privacy).
 *
 * The original delete-account handler had two flaws: a query bug that
 * always treated the user as the sole household member, and — worse — it
 * never deleted the high-value PII (Plaid access tokens, transactions,
 * Tilly's learned memory, chat history). Those orphaned rows are exactly
 * what a privacy review flags.
 *
 * This module deletes EVERYTHING tied to a household or a user. Because
 * the legacy "couple"→"household" rename left tenant columns inconsistent
 * (`couple_id` on some tables, `household_id` on others, all carrying the
 * same id value), we drive deletion from an explicit (table, column) map
 * and run each statement defensively — a missing table/column in some
 * environment must not abort the purge. Parameterized throughout.
 */
import type pg from "pg";

// (table, tenant column) keyed by the HOUSEHOLD/couple id value.
const HOUSEHOLD_TABLES: Array<[string, string]> = [
  ["plaid_transactions", "couple_id"],
  ["plaid_items", "couple_id"],
  ["expenses", "couple_id"],
  ["goals", "couple_id"], // goal_contributions cascade via FK
  ["category_budgets", "couple_id"],
  ["custom_categories", "couple_id"],
  ["settlements", "couple_id"],
  ["partner_invites", "couple_id"],
  ["merchant_rules", "couple_id"],
  ["guardian_conversations", "couple_id"],
  ["guardian_recommendations", "couple_id"],
  ["subscriptions", "household_id"],
  ["protections", "household_id"],
  ["tilly_memory", "household_id"],
  ["tilly_memory_v2", "household_id"],
  ["tilly_events", "household_id"],
  ["tilly_reminders", "household_id"],
  ["tilly_nudges", "household_id"],
  ["tilly_questions", "household_id"],
  ["tilly_scout_jobs", "household_id"],
  ["tilly_money_snapshot", "household_id"],
  ["tilly_life_context", "household_id"],
  ["watchlist_items", "household_id"],
  ["projection_history", "household_id"],
];

// (table, column) keyed by the USER id value.
const USER_TABLES: Array<[string, string]> = [
  ["user_credentials", "user_id"],
  ["push_tokens", "user_id"],
  ["user_preferences", "user_id"],
  ["tilly_tone_pref", "user_id"],
  ["tilly_dossiers", "user_id"],
  ["tilly_retrieval_log", "user_id"],
  ["sessions", "user_id"],
];

async function deleteWhere(
  pool: pg.Pool,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  try {
    const res = await pool.query(
      `DELETE FROM "${table}" WHERE "${column}" = $1`,
      [value],
    );
    return res.rowCount ?? 0;
  } catch (err) {
    // Table/column may not exist in every environment — log, don't abort.
    console.warn(`[purge] ${table}.${column} skipped: ${(err as Error)?.message}`);
    return 0;
  }
}

/** Delete every row tied to a household id (couple_id or household_id). */
export async function purgeHouseholdData(pool: pg.Pool, householdId: string): Promise<number> {
  let total = 0;
  for (const [table, col] of HOUSEHOLD_TABLES) {
    total += await deleteWhere(pool, table, col, householdId);
  }
  return total;
}

/** Delete every row tied directly to a user id (config, creds, sessions). */
export async function purgeUserData(pool: pg.Pool, userId: string): Promise<number> {
  let total = 0;
  for (const [table, col] of USER_TABLES) {
    total += await deleteWhere(pool, table, col, userId);
  }
  return total;
}
