/**
 * Forecast composer — per-day expected spend for the next N days.
 *
 * Three signals stacked together:
 *
 *  (1) **Known recurring obligations.** Subscriptions with a
 *      `next_charge_at` falling inside the window. These are
 *      deterministic — Spotify on the 12th, rent on the 1st — so we
 *      cite them by name in the reasons list.
 *
 *  (2) **Trailing 8-week per-dayOfWeek average.** What did this user
 *      actually spend on each weekday over the recent past? Powers
 *      the "Saturdays typically run ~$70" baseline so even a day
 *      with no known recurring still gets a real number.
 *
 *  (3) **Seasonal / month-shape adjustment.** If the user historically
 *      pays rent / fixed bills in the first 3 days of the month and
 *      the forecast window crosses that range, the cluster gets a
 *      bump (and a "fixed bills typically post" reason).
 *
 * Reasons array is the hero of the output — Home renders one or two
 * of them under each forecasted day card. Keep them 1–4 words each.
 * Empty array means "no signal, fell back to baseline" — the day
 * card just shows the number.
 *
 * Per-user TZ throughout. `today` is the local YYYY-MM-DD, not UTC.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  plaidTransactions,
  subscriptions,
  expenses,
} from "../../shared/schema";
import { getUserTimezone, localDateString, localDaysAgoIso } from "./user-tz";

export type ForecastDay = {
  /** YYYY-MM-DD in user TZ. */
  date: string;
  /** Dollars expected (≥ 0). */
  expected: number;
  /** Reasons — 0-3 short strings. */
  reasons: string[];
};

const DISCRETIONARY_FILTER_CATS = new Set([
  "loans",
  "taxes",
  "transfers",
  "fees",
  "income",
]);

/**
 * Returns one ForecastDay per future date for the next `days` days
 * starting from tomorrow (inclusive). Today is excluded — partial
 * day forecasts are noisy and the Home day strip starts at
 * "Tomorrow" anyway.
 */
export async function forecastNextNDays(
  userId: string | null,
  householdId: string,
  days: number,
  now: Date = new Date(),
): Promise<ForecastDay[]> {
  const tz = await getUserTimezone(userId);
  const todayIso = localDateString(now, tz);

  // ── (2) Build the trailing-8wk per-dayOfWeek baseline ─────────────
  const eightWksAgo = localDaysAgoIso(now, tz, 8 * 7);
  const trailingRows = await db
    .select({
      date: plaidTransactions.date,
      amount: plaidTransactions.amount,
      category: plaidTransactions.ourCategory,
    })
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        eq(plaidTransactions.status, "accepted"),
        gte(plaidTransactions.date, eightWksAgo),
        sql`${plaidTransactions.amount} > 0`,
      ),
    );

  const dowTotals: number[][] = [[], [], [], [], [], [], []]; // sun..sat
  for (const r of trailingRows) {
    const cat = (r.category || "").toLowerCase();
    if (DISCRETIONARY_FILTER_CATS.has(cat)) continue;
    const dow = new Date(r.date + "T12:00:00Z").getUTCDay(); // calendar-only
    dowTotals[dow].push(r.amount);
  }
  // Per-day weekday average across weeks. We have N weeks of data;
  // total spend on that weekday / week-count = average per-occurrence.
  const baselineByDow = dowTotals.map((arr) => {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / Math.max(1, Math.ceil(arr.length / 1));
  });
  // Round + clamp into a "typical-day" number. Soft floor of $10 so a
  // brand-new account with no history doesn't show $0 every day.
  const typicalByDow = baselineByDow.map((v) => Math.max(10, Math.round(v)));

  // ── (1) Subscriptions known to post in the window ─────────────────
  const subs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.householdId, householdId),
        eq(subscriptions.status, "active"),
      ),
    );

  // Map date → list of subscription hits.
  const subsByDate = new Map<string, Array<{ merchant: string; amount: number }>>();
  for (const s of subs) {
    if (!s.nextChargeAt) continue;
    const dateOnly = s.nextChargeAt.slice(0, 10); // YYYY-MM-DD
    const arr = subsByDate.get(dateOnly) ?? [];
    arr.push({ merchant: s.merchant, amount: s.amount });
    subsByDate.set(dateOnly, arr);
  }

  // ── (3) Month-shape adjustment ────────────────────────────────────
  // Has the user historically had a fixed-bills cluster in the first
  // 3 days of recent months? Sum trailing tx where dayOfMonth ∈ {1,2,3}
  // and category ∈ fixed obligations. If non-trivial, the forecast
  // for d-of-month 1-3 adds a bump.
  let firstOfMonthBump = 0;
  let firstOfMonthCount = 0;
  for (const r of trailingRows) {
    const dom = parseInt(r.date.slice(8, 10), 10);
    if (dom >= 1 && dom <= 3) {
      const cat = (r.category || "").toLowerCase();
      if (cat === "loans" || cat === "taxes" || cat === "subscriptions") {
        firstOfMonthBump += r.amount;
        firstOfMonthCount++;
      }
    }
  }
  // Average over ~2 month boundaries observed in 8wks of data.
  if (firstOfMonthCount > 0) firstOfMonthBump = firstOfMonthBump / 2;

  // ── Build the per-day forecast ────────────────────────────────────
  const out: ForecastDay[] = [];
  const today = parseLocalDate(todayIso);
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = formatLocalDate(d);
    const dom = d.getUTCDate();
    const dow = d.getUTCDay();
    const reasons: string[] = [];

    // Subscription hits on this date
    let subTotal = 0;
    const subHits = subsByDate.get(dateStr) ?? [];
    for (const s of subHits) {
      subTotal += s.amount;
      reasons.push(`${s.merchant} ${Math.round(s.amount)}`);
    }

    // First-of-month bump
    let monthShape = 0;
    if (dom >= 1 && dom <= 3 && firstOfMonthBump > 0) {
      monthShape = Math.round(firstOfMonthBump / 3); // spread across 1-2-3
      reasons.push("fixed bills typically post");
    }

    // Baseline
    const baseline = typicalByDow[dow];
    if (baseline > 0 && subTotal === 0 && monthShape === 0) {
      // Only annotate baseline as a reason if it's the dominant signal
      reasons.push(`typical ${dayName(dow)} spend`);
    }

    const expected = Math.round(subTotal + monthShape + baseline);
    out.push({ date: dateStr, expected, reasons: reasons.slice(0, 2) });
  }

  return out;
}

function parseLocalDate(iso: string): Date {
  // Build a noon-UTC anchor so day arithmetic is TZ-safe.
  return new Date(iso + "T12:00:00Z");
}

function formatLocalDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dayName(dow: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
}
