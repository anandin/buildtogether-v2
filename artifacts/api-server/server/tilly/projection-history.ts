/**
 * Smart Tilly #11 — projection error tracking.
 *
 * Two cron-driven helpers:
 *   recordProjectionForAll   — daily, captures the latest predicted_close
 *                              for the current month per household.
 *                              Idempotent upsert keyed on (household, month).
 *   settleProjectionsForAll  — monthly (1st), computes the actual close
 *                              for the prior month and stamps settled_at.
 *
 * The detector in detectors.ts reads `projection_history` to surface
 * "Tilly's projections have been within $X on average" — which is what
 * lets the user trust forward-looking numbers.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { households } from "../../shared/schema";

export async function recordProjectionForAll(): Promise<{
  scanned: number;
  recorded: number;
  errors: number;
}> {
  const rows = await db
    .select({ id: households.id })
    .from(households);
  let recorded = 0;
  let errors = 0;
  // Compute today's projection inline — same definition computeMonthFlow
  // uses (variable scales with days, fixed stays put), but in pure SQL
  // so we can scan all households without a per-household round-trip
  // through the application layer. Income is the simple monthly sum;
  // refinements (cadence projection) happen on the live API path. The
  // cron just needs a stable predicted_close to compare against actuals
  // at month-end.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = now.toISOString().slice(0, 10);
  const startIso = `${y}-${String(m).padStart(2, "0")}-01`;
  const endIso = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const dayOfMonth = parseInt(today.slice(8, 10), 10);
  const daysLeft = lastDay - dayOfMonth;
  const monthKey = `${y}-${String(m).padStart(2, "0")}`;

  for (const h of rows) {
    try {
      const aggResult = await db.execute(sql`
        WITH ledger AS (
          SELECT amount, our_category
          FROM plaid_transactions
          WHERE couple_id = ${h.id}
            AND status = 'accepted'
            AND date >= ${startIso}
            AND date <= ${today}
        )
        SELECT
          COALESCE(SUM(CASE WHEN LOWER(our_category) = 'income' THEN ABS(amount) ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN LOWER(our_category) IN ('loans','taxes','fees','insurance','subscriptions','rent','mortgage','utilities') AND amount > 0 THEN amount ELSE 0 END), 0) AS fixed_so_far,
          COALESCE(SUM(CASE WHEN LOWER(our_category) NOT IN ('income','transfers','cashback','credit_adjustment','loans','taxes','fees','insurance','subscriptions','rent','mortgage','utilities') AND amount > 0 THEN amount ELSE 0 END), 0) AS variable_so_far
        FROM ledger
      `);
      const agg =
        (aggResult as unknown as { rows?: Array<{ income: number; fixed_so_far: number; variable_so_far: number }> }).rows?.[0]
        ?? (aggResult as unknown as Array<{ income: number; fixed_so_far: number; variable_so_far: number }>)[0];
      if (!agg) continue;
      const variableSoFar = Number(agg.variable_so_far);
      const fixedSoFar = Number(agg.fixed_so_far);
      const income = Number(agg.income);
      const dailyPace = dayOfMonth > 0 ? variableSoFar / dayOfMonth : 0;
      const variableRest = dailyPace * daysLeft;
      const projectedSpend = variableSoFar + fixedSoFar + variableRest;
      const predictedClose = income - projectedSpend;
      await db.execute(sql`
        INSERT INTO projection_history (household_id, month, predicted_close, predicted_at)
        VALUES (${h.id}, ${monthKey}, ${predictedClose}, now())
        ON CONFLICT (household_id, month) DO UPDATE
          SET predicted_close = EXCLUDED.predicted_close,
              predicted_at    = EXCLUDED.predicted_at
      `);
      recorded += 1;
    } catch (err) {
      console.warn("[projection-history] record failed for", h.id, err);
      errors += 1;
    }
  }
  return { scanned: rows.length, recorded, errors };
}

export async function settleProjectionsForAll(): Promise<{
  scanned: number;
  settled: number;
  errors: number;
}> {
  // Settle the PRIOR month: when this cron runs at midnight on the 1st,
  // "current month" is brand-new and has nothing to settle. The prior
  // month is the one that just closed.
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12 for current month
  let priorY = y;
  let priorM = m - 1;
  if (priorM < 1) {
    priorM = 12;
    priorY -= 1;
  }
  const startIso = `${priorY}-${String(priorM).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(priorY, priorM, 0)).getUTCDate();
  const endIso = `${priorY}-${String(priorM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const monthKey = `${priorY}-${String(priorM).padStart(2, "0")}`;

  const rows = await db.select({ id: households.id }).from(households);
  let settled = 0;
  let errors = 0;
  for (const h of rows) {
    try {
      const result = await db.execute(sql`
        WITH ledger AS (
          SELECT amount, our_category
          FROM plaid_transactions
          WHERE couple_id = ${h.id}
            AND status = 'accepted'
            AND date >= ${startIso}
            AND date <= ${endIso}
        )
        SELECT
          COALESCE(SUM(CASE WHEN LOWER(our_category) = 'income' THEN ABS(amount) ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN LOWER(our_category) NOT IN ('income','transfers','cashback','credit_adjustment') AND amount > 0 THEN amount ELSE 0 END), 0) AS spend
        FROM ledger
      `);
      const item =
        (result as unknown as { rows?: Array<{ income: number; spend: number }> }).rows?.[0]
        ?? (result as unknown as Array<{ income: number; spend: number }>)[0];
      if (!item) continue;
      const actualClose = Number(item.income) - Number(item.spend);
      await db.execute(sql`
        INSERT INTO projection_history (household_id, month, predicted_close, actual_close, settled_at)
        VALUES (${h.id}, ${monthKey}, 0, ${actualClose}, now())
        ON CONFLICT (household_id, month) DO UPDATE
          SET actual_close = EXCLUDED.actual_close,
              settled_at   = now()
      `);
      settled += 1;
    } catch (err) {
      console.warn("[projection-history] settle failed for", h.id, err);
      errors += 1;
    }
  }
  return { scanned: rows.length, settled, errors };
}
