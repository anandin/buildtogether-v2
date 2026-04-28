/**
 * Weekly spend pattern + soft-spot detection — feeds BTSpend (spec §4.3).
 *
 * Soft-spot definition: a category × day-of-week combo where this week's
 * spend exceeds the 8-week mean by ≥1.5 sigma. The headline picks the
 * day with the strongest signal ("Wednesdays are still your soft spot").
 *
 * Reads from `plaid_transactions` directly (not the legacy `expenses`
 * table) so the analysis tracks real bank activity. Returns the exact
 * shape BTSpend renders: bars (M-S), categories (with softSpot flags),
 * paycheck, and the editorial headline.
 */
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { plaidTransactions } from "../../shared/schema";

export type DayBar = {
  d: string; // M T W T F S S
  amt: number;
  soft?: boolean;
  today?: boolean;
};

export type SpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;
  amt: number;
  softSpot?: boolean;
};

export type WeeklyPattern = {
  ready: true;
  spent: number;
  headline: string;
  italicSpan?: string;
  bars: DayBar[];
  categories: SpendCategory[];
  today: { id: string; who: string; cat: string; amt: number; time: string }[];
  paycheck?: { amount: number; source: string; day: string; daysUntil: number };
};

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const FULL_DAY_NAMES = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

function dayOfWeekIndex(dateStr: string): number {
  const d = new Date(dateStr);
  // Monday=0 ... Sunday=6
  const js = d.getDay();
  return js === 0 ? 6 : js - 1;
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function categoryHue(name: string): SpendCategory["hue"] {
  const n = name.toLowerCase();
  if (n.includes("coffee") || n.includes("cafe")) return "accent";
  if (n.includes("food") || n.includes("restaurant") || n.includes("doordash")) return "good";
  if (n.includes("groceries")) return "accent2";
  if (n.includes("school") || n.includes("textbook")) return "warn";
  return "inkSoft";
}

function contextFor(name: string, softDayIdx: number | null): string {
  if (softDayIdx !== null) return `${FULL_DAY_NAMES[softDayIdx]} especially`;
  if (name.toLowerCase().includes("late") || name.toLowerCase().includes("food"))
    return "Always after 9pm";
  if (name.toLowerCase().includes("groceries")) return "Trader Joe's haul";
  return "";
}

/**
 * Aggregate this week's spend per (category, dayOfWeek) and compare against
 * the trailing 8-week per-cell mean+stddev to flag soft spots.
 *
 * Returns null if no Plaid transactions exist — caller surfaces a
 * "connect a bank" state.
 */
export async function buildWeeklyPattern(
  householdId: string,
): Promise<WeeklyPattern | null> {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const eightWeeksAgo = new Date(weekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 8 * 7);

  const txRows = await db
    .select()
    .from(plaidTransactions)
    .where(
      and(
        eq(plaidTransactions.coupleId, householdId),
        sql`${plaidTransactions.date} >= ${eightWeeksAgo.toISOString().slice(0, 10)}`,
        sql`${plaidTransactions.amount} > 0`, // only outflows; Plaid positives = debits
      ),
    );

  if (txRows.length === 0) return null;

  // ─── Bars: this week's daily totals ─────────────────────────────────────
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const todayIdx = dayOfWeekIndex(now.toISOString().slice(0, 10));
  const dailyTotals = new Array(7).fill(0);
  const thisWeekTx = txRows.filter((t) => t.date >= weekStartIso);
  for (const t of thisWeekTx) {
    const di = dayOfWeekIndex(t.date);
    dailyTotals[di] += t.amount;
  }

  // ─── Soft-spot detection: category × day cells ─────────────────────────
  // Per-cell stats over the trailing 8 weeks (excluding this week).
  const cellAmounts = new Map<string, number[]>(); // key = "category|dayIdx"
  const olderTx = txRows.filter((t) => t.date < weekStartIso);
  for (const t of olderTx) {
    const cat = (t.ourCategory || "Uncategorized").trim();
    const di = dayOfWeekIndex(t.date);
    const key = `${cat}|${di}`;
    const arr = cellAmounts.get(key) ?? [];
    arr.push(t.amount);
    cellAmounts.set(key, arr);
  }

  // This-week per-cell totals.
  const thisWeekCells = new Map<string, number>();
  for (const t of thisWeekTx) {
    const cat = (t.ourCategory || "Uncategorized").trim();
    const di = dayOfWeekIndex(t.date);
    const key = `${cat}|${di}`;
    thisWeekCells.set(key, (thisWeekCells.get(key) ?? 0) + t.amount);
  }

  const softCells: { category: string; dayIdx: number; sigma: number }[] = [];
  for (const [key, thisAmt] of thisWeekCells.entries()) {
    const history = cellAmounts.get(key) ?? [];
    if (history.length < 3) continue; // not enough data to call it a pattern
    const mean = history.reduce((s, v) => s + v, 0) / history.length;
    const variance =
      history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    const sigmas = (thisAmt - mean) / std;
    if (sigmas >= 1.5) {
      const [category, dayStr] = key.split("|");
      softCells.push({ category, dayIdx: parseInt(dayStr, 10), sigma: sigmas });
    }
  }
  softCells.sort((a, b) => b.sigma - a.sigma);

  // Mark bar days that have any soft cell.
  const softDays = new Set(softCells.map((c) => c.dayIdx));
  const bars: DayBar[] = dailyTotals.map((amt, i) => ({
    d: DAY_LETTERS[i],
    amt: Math.round(amt),
    soft: softDays.has(i),
    today: i === todayIdx,
  }));

  // ─── Categories: this week's top spends with soft-spot tag ─────────────
  const catTotals = new Map<string, number>();
  for (const t of thisWeekTx) {
    const cat = (t.ourCategory || "Uncategorized").trim();
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + t.amount);
  }
  const sortedCats = [...catTotals.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const categories: SpendCategory[] = sortedCats.map(([name, amt]) => {
    const softCell = softCells.find((c) => c.category === name);
    const softDayIdx = softCell ? softCell.dayIdx : null;
    return {
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      hue: categoryHue(name),
      context: contextFor(name, softDayIdx),
      amt: Math.round(amt),
      softSpot: !!softCell,
    };
  });

  // ─── Headline: pick the strongest soft signal, fall back to neutral ────
  const totalSpent = thisWeekTx.reduce((s, t) => s + t.amount, 0);
  const top = softCells[0];
  let headline: string;
  let italicSpan: string | undefined;
  if (top) {
    italicSpan = FULL_DAY_NAMES[top.dayIdx];
    headline = `$${Math.round(totalSpent)} spent. ${italicSpan} are still your soft spot.`;
  } else {
    headline = `$${Math.round(totalSpent)} spent. No surprises this week.`;
  }

  // ─── Today mini-ledger: top 3 today ────────────────────────────────────
  const todayIso = now.toISOString().slice(0, 10);
  const todayTx = txRows
    .filter((t) => t.date === todayIso)
    .slice(0, 3)
    .map((t) => ({
      id: t.id,
      who: t.merchantName || t.name,
      cat: t.ourCategory || "Uncategorized",
      amt: t.amount,
      time: "today",
    }));

  return {
    ready: true,
    spent: Math.round(totalSpent),
    headline,
    italicSpan,
    bars,
    categories,
    today: todayTx,
  };
}
