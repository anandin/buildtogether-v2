/**
 * Weekly spend pattern — feeds BTSpend (spec §4.3).
 *
 * Computes:
 *   - The headline ("$148 spent. Wednesdays are still your soft spot.")
 *   - 7 day-bars (M–S) with spend totals and soft-spot flags
 *   - Emotional categories sorted by amount, with contextual one-liners
 *     ("Wednesdays especially", "Always after 9pm", "Trader Joe haul Sunday")
 *   - Today's mini-ledger (compact)
 *
 * Soft-spot detection: a category × day-of-week combination that exceeds
 * the user's own median spend on the same combo by ≥1.5σ over the trailing
 * 8 weeks. Implemented in `server/pattern-detection.ts` (Phase 4 enhances
 * the existing logic to be day×category aware — currently it's category-
 * only).
 *
 * Phase 4 fills this; the route returns `{ phase: 4, ready: false }` until
 * then.
 */
import type { BTToneKey } from "./tone";

export type DayBar = { d: string; amt: number; soft?: boolean; today?: boolean };

export type SpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;
  amt: number;
  softSpot?: boolean;
};

export type WeeklyPattern = {
  spent: number;
  headline: string;
  italicSpan?: string; // the part of `headline` to italicize, e.g. "Wednesdays"
  bars: DayBar[];
  categories: SpendCategory[];
  today: { id: string; who: string; cat: string; amt: number; time: string }[];
  paycheck: { amount: number; source: string; day: string; daysUntil: number };
};

export type WeeklyPatternInput = {
  householdId: string;
  tone: BTToneKey;
  /** ISO timestamp; lets us compute today and week start. */
  now: string;
};

export async function buildWeeklyPattern(
  _input: WeeklyPatternInput,
): Promise<WeeklyPattern> {
  throw new Error("Phase 4: buildWeeklyPattern not yet implemented");
}
