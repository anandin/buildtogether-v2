/**
 * Recurring-spend inference from stored transaction history.
 *
 * v1 is deliberately strict: a merchant becomes a subscription only when
 * charges repeat on a stable interval with a stable amount. Two coffees
 * at the same shop do not qualify. Plaid's recurring-streams API is a
 * separate, optional source — this module is the history fallback that
 * works in sandbox and when that endpoint isn't offered.
 */

export type RecurringSample = {
  merchant: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category?: string | null;
};

export type InferredRecurring = {
  merchant: string;
  amount: number;
  cadence: "weekly" | "monthly" | "yearly" | "custom";
  cadenceDays: number;
  occurrences: number;
  lastChargedAt: string;
  nextChargeAt: string;
  confidence: number;
};

const SKIP_CATEGORY = new Set([
  "transfer",
  "transfers",
  "income",
  "fees",
  "fee",
  "loans",
  "loan",
  "taxes",
  "tax",
  "cashback",
  "credit_adjustment",
  "payment",
]);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pos|debit|credit|purchase|visa|mc|ach|web|pymt|payment)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

function classifyInterval(days: number): { cadence: InferredRecurring["cadence"]; cadenceDays: number } | null {
  if (days >= 6 && days <= 9) return { cadence: "weekly", cadenceDays: 7 };
  if (days >= 12 && days <= 16) return { cadence: "custom", cadenceDays: 14 };
  if (days >= 26 && days <= 35) return { cadence: "monthly", cadenceDays: 30 };
  if (days >= 80 && days <= 100) return { cadence: "custom", cadenceDays: 91 };
  if (days >= 170 && days <= 200) return { cadence: "custom", cadenceDays: 182 };
  if (days >= 330 && days <= 400) return { cadence: "yearly", cadenceDays: 365 };
  return null;
}

function advanceNext(last: string, cadenceDays: number, todayIso: string): string {
  let next = addDays(last, cadenceDays);
  let guard = 0;
  while (next < todayIso && guard < 36) {
    next = addDays(next, cadenceDays);
    guard += 1;
  }
  return next;
}

/**
 * Group outflows into recurring streams. `todayIso` anchors nextChargeAt
 * so a stream whose last charge is in the past still projects forward.
 */
export function inferRecurring(
  rows: RecurringSample[],
  todayIso: string,
): InferredRecurring[] {
  const groups = new Map<string, RecurringSample[]>();
  for (const row of rows) {
    if (!row.merchant || !row.date || !(row.amount > 0)) continue;
    const cat = (row.category || "").trim().toLowerCase();
    if (SKIP_CATEGORY.has(cat)) continue;
    const key = normalizeMerchant(row.merchant);
    if (key.length < 3) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: InferredRecurring[] = [];
  for (const [, samples] of groups) {
    const byDate = new Map<string, RecurringSample>();
    for (const s of samples) {
      const prev = byDate.get(s.date);
      if (!prev || s.amount > prev.amount) byDate.set(s.date, s);
    }
    const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (series.length < 2) continue;

    const amounts = series.map((s) => s.amount);
    const medAmt = median(amounts);
    if (!(medAmt > 0)) continue;
    const stable = series.filter((s) => Math.abs(s.amount - medAmt) / medAmt <= 0.2);
    if (stable.length < 2) continue;

    const intervals: number[] = [];
    for (let i = 1; i < stable.length; i++) {
      const gap = daysBetween(stable[i - 1]!.date, stable[i]!.date);
      if (gap > 0) intervals.push(gap);
    }
    if (intervals.length === 0) continue;
    const medGap = median(intervals);
    const cadence = classifyInterval(medGap);
    if (!cadence) continue;

    const deviations = intervals.map((g) => Math.abs(g - medGap) / medGap);
    const meanDev = deviations.reduce((s, n) => s + n, 0) / deviations.length;
    if (meanDev > 0.35) continue;

    const distinctMonths = new Set(stable.map((s) => s.date.slice(0, 7)));
    const minCount = cadence.cadence === "weekly" ? 3 : 2;
    if (stable.length < minCount) continue;
    if (cadence.cadence !== "weekly" && distinctMonths.size < 2 && stable.length < 3) continue;

    const last = stable[stable.length - 1]!.date;
    const display =
      stable[stable.length - 1]!.merchant.trim() || stable[0]!.merchant.trim();
    const confidence = Math.max(
      0.55,
      Math.min(0.95, 0.7 + stable.length * 0.05 - meanDev),
    );
    out.push({
      merchant: display,
      amount: Math.round(medAmt * 100) / 100,
      cadence: cadence.cadence,
      cadenceDays: cadence.cadenceDays,
      occurrences: stable.length,
      lastChargedAt: last,
      nextChargeAt: advanceNext(last, cadence.cadenceDays, todayIso),
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  return out.sort((a, b) => b.amount - a.amount);
}
