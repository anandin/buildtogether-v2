/**
 * One-shot: when cutting over from Plaid sandbox/development to production,
 * existing access tokens issued by the lower environments are not valid in
 * production. Calling them returns 400 INVALID_ACCESS_TOKEN, the sync
 * silently fails, and the user just sees stale data.
 *
 * This script marks every plaid_items row as `disconnected` so the mobile
 * app's bank-connections screen prompts the user to reconnect via Link
 * (which will issue a fresh production access token).
 *
 * Run AFTER setting PLAID_ENV=production and the prod client_id/secret in
 * the deployment env, but BEFORE telling users the app is in prod:
 *   pnpm --filter @workspace/api-server exec tsx scripts/invalidate-non-prod-items.ts
 *
 * Idempotent. Skips items already disconnected.
 */
import { eq, ne } from "drizzle-orm";
import { db, pool } from "../server/db";
import { plaidItems } from "../shared/schema";

async function main() {
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  if (env !== "production") {
    console.warn(
      `[invalidate-non-prod-items] PLAID_ENV is "${env}", not "production". ` +
        `This script is intended to run during the prod cutover. Continue anyway? ` +
        `Set PLAID_ENV=production before running. Aborting.`,
    );
    await pool?.end();
    process.exit(2);
  }

  const before = await db
    .select()
    .from(plaidItems)
    .where(ne(plaidItems.status, "disconnected"));

  console.log(
    `[invalidate-non-prod-items] disconnecting ${before.length} active/error items`,
  );

  for (const item of before) {
    await db
      .update(plaidItems)
      .set({
        status: "disconnected",
        lastError:
          "Connected during sandbox/development. Please reconnect for production.",
      })
      .where(eq(plaidItems.id, item.id));
    console.log(`  · ${item.institutionName ?? item.id} (couple ${item.coupleId})`);
  }

  console.log("[invalidate-non-prod-items] done");
  await pool?.end();
}

main().catch((err) => {
  console.error("[invalidate-non-prod-items] fatal:", err);
  process.exit(1);
});
