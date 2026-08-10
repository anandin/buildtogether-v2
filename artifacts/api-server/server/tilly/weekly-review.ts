/**
 * Weekly review composer — the push is an offer or it is silence.
 *
 * Replaces the report-style Sunday push ("You spent $773 on day-to-day
 * this week — $2,638 less than last week. $773 spent. Thursdays are
 * still your soft spot."). That message failed four ways at once, and
 * each failure is now a rule here:
 *
 *   1. It buried good news in deficit framing. A $2,638 improvement is
 *      the best week-over-week result the data can show, and the copy
 *      led with "You spent". → A win week leads with what STAYED.
 *   2. It repeated the total twice — two generators (delta line +
 *      pattern headline) concatenated blind. → One composer owns the
 *      whole string; a dollar figure may appear at most once.
 *   3. "Thursdays are STILL your soft spot" is retrospective judgment —
 *      "I've been watching you fail". → Patterns are only ever surfaced
 *      prospectively, as a pre-commitment offer for the week ahead
 *      (implementation intention), never as a verdict on the week past.
 *   4. It asked for nothing and offered nothing. → Every push must
 *      terminate in an offer the user can act on. A week with nothing
 *      decidable produces NO push. Silence is the correct output, not a
 *      degraded one — it is what keeps the pushes that do arrive worth
 *      reading.
 *
 * Pure module: the cron assembles inputs, this decides. PRD §3 P4/P5,
 * docs/PRD_COMMITMENT_LAYER.md.
 */
import type { Frame } from "./nudge-log";

// ─── Materiality ─────────────────────────────────────────────────────
// A delta is worth an interruption when it clears BOTH an absolute
// floor (so a $40 wiggle on a quiet week never fires) and a relative
// one (so $150 on a $4k baseline doesn't read as news).

export const DELTA_FLOOR_DOLLARS = 100;
export const DELTA_FLOOR_SHARE = 0.15;

export function isMaterialDelta(delta: number, priorTotal: number): boolean {
  const abs = Math.abs(delta);
  return abs >= DELTA_FLOOR_DOLLARS && abs >= priorTotal * DELTA_FLOOR_SHARE;
}

// Claim sizing — same convention as computePaydayAllocation's dream
// sweep: 10% of the win, rounded DOWN to $25 steps so the number reads
// intentional, capped at what the target still needs.
export const CLAIM_RATE = 0.1;
export const CLAIM_STEP = 25;

export function claimAmount(win: number, remainingToTarget: number): number {
  if (win <= 0 || remainingToTarget <= 0) return 0;
  const stepped = Math.floor((win * CLAIM_RATE) / CLAIM_STEP) * CLAIM_STEP;
  // No bumping up to the step: a $150 win yields $15, and offering $25
  // anyway would quietly break the stated rate. Below one step → no
  // claim, and the composer goes silent rather than sending a token ask.
  if (stepped < CLAIM_STEP) return 0;
  return Math.min(stepped, Math.round(remainingToTarget));
}

// ─── Inputs / output ─────────────────────────────────────────────────

export type WeeklyReviewInput = {
  thisWeekTotal: number;
  priorWeekTotal: number;
  /** Where a claimed win would go. Null when the household has no goal
   * with anything left to fund — in which case a win week has no offer
   * and therefore no push. */
  claimTarget: {
    goalId: string;
    name: string;
    remainingToTarget: number;
  } | null;
  /** Strongest habitual category×day cell from the pattern engine, if
   * any — e.g. { day: "Thursday", category: "dining" }. Only ever used
   * to offer a pre-commitment for the week AHEAD. */
  softSpot: { day: string; category: string } | null;
  /** From assessIncomeConfidence().blocksSurplusClaims. A claim offer
   * is an affordability-adjacent statement; while the income
   * denominator is unverified the most valuable push is the income
   * question itself. */
  incomeBlocked: boolean;
};

export type WeeklyReviewPush = {
  kind: "claim_win" | "income_question" | "precommit_offer";
  frame: Frame;
  title: string;
  body: string;
  /** Longer in-app card text; omitted when body already says it all. */
  cardBody?: string;
  /** Present on claim_win — what the one-tap accept should execute. */
  claimSuggestion?: { goalId: string; name: string; amount: number };
};

/** Null = no push this week. The cron treats null as success, not as a
 * fallback path — nothing is recorded, nothing is sent. */
export function composeWeeklyReview(input: WeeklyReviewInput): WeeklyReviewPush | null {
  const delta = Math.round(input.thisWeekTotal - input.priorWeekTotal);

  if (!isMaterialDelta(delta, input.priorWeekTotal)) return null;

  // ── Win week ───────────────────────────────────────────────────────
  if (delta < 0) {
    const win = Math.abs(delta);

    // The win is real but the denominator isn't verified — asking the
    // income question IS the offer this week. One push, not two.
    if (input.incomeBlocked) {
      return {
        kind: "income_question",
        frame: "sdt_competence",
        title: "A lighter week — one thing first",
        body: `This week ran $${win.toLocaleString()} lighter than last. Before I can say what that frees up, a couple of deposits need a yes/no from you — two taps on Home.`,
      };
    }

    if (!input.claimTarget) return null;

    const amount = claimAmount(win, input.claimTarget.remainingToTarget);
    if (amount < CLAIM_STEP) return null;

    return {
      kind: "claim_win",
      frame: "goal_gradient",
      title: "A lighter week",
      body: `$${win.toLocaleString()} stayed with you this week compared to last. Want to point $${amount} of it at ${input.claimTarget.name} before the month absorbs it?`,
      cardBody: `This week ran $${win.toLocaleString()} lighter than last — that money is sitting in checking, unclaimed. Moving $${amount} to ${input.claimTarget.name} makes the good week permanent; leaving it is fine too.`,
      claimSuggestion: {
        goalId: input.claimTarget.goalId,
        name: input.claimTarget.name,
        amount,
      },
    };
  }

  // ── Heavy week ─────────────────────────────────────────────────────
  // A "you spent more" report with no action is exactly the artifact
  // this module exists to kill. The only heavy-week push is a forward
  // offer; without a pattern to pre-commit against, silence.
  if (!input.softSpot) return null;

  return {
    kind: "precommit_offer",
    frame: "implementation_intention",
    title: "For the week ahead",
    body: `${input.softSpot.day}s tend to run heaviest on ${input.softSpot.category}. Want to set that money aside at the start of the week, so ${input.softSpot.day} is already covered?`,
    cardBody: `This week ran heavier than last — it's done, and there's nothing to fix about it. Looking ahead: ${input.softSpot.day}s are when ${input.softSpot.category} usually lands. Setting the money aside in advance turns the heavy day into a planned one.`,
  };
}
