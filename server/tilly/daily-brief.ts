/**
 * Daily brief — generates the BTHome hero copy.
 *
 * Spec §4.1: "The number that matters today is *breathing room*, not balance."
 *
 * Output shape (consumed by GET /api/tilly/today):
 *   {
 *     greeting:        "Hey Maya.",
 *     dayLabel:        "Tuesday morning" | "Tuesday · 9:18 pm",
 *     breathing:       312,                 // post-rent, pre-paycheck buffer
 *     afterRent:       412.58,              // big serif number
 *     paycheckCopy:    "After Thursday rent · Friday paycheck +$612",
 *     subscriptionTile?: { merchant, amount, sub, cta },  // most-urgent unused sub
 *     dreamTile?:        { name, sub, saved, target },    // most-active dream
 *     tillyInvite:      "Anything you want to think through?",
 *   }
 *
 * Phase 2 fills this from:
 *   - User household + Plaid balance
 *   - Upcoming bills (recurring tx within next 7 days)
 *   - Paycheck cadence (income tx pattern)
 *   - Active subscriptions with `lastUsedAt` > 30 days
 *   - Dreams with progress
 *
 * The tile selection logic uses the protections feed: pick the highest-
 * severity protection that has a CTA the student can act on in <2 taps.
 */
import type { BTToneKey } from "./tone";

export type DailyBrief = {
  greeting: string;
  dayLabel: string;
  breathing: number;
  afterRent: number;
  paycheckCopy: string;
  subscriptionTile?: {
    merchant: string;
    amount: number;
    usageNote: string;
    ctaLabel: string;
    subscriptionId: string;
  };
  dreamTile?: {
    name: string;
    autoSaveCopy: string;
    saved: number;
    target: number;
  };
  tillyInvite: string;
};

export type DailyBriefInput = {
  userId: string;
  householdId: string;
  tone: BTToneKey;
  /** ISO timestamp; lets us compute morning/evening. */
  now: string;
};

/**
 * Phase 2 wires this. The greeting + invite phrasing run through Claude with
 * the persona + tone blocks; the numeric copy is templated from ledger data.
 */
export async function buildDailyBrief(
  _input: DailyBriefInput,
): Promise<DailyBrief> {
  throw new Error("Phase 2: buildDailyBrief not yet implemented");
}
