import { describe, expect, it } from "vitest";

import {
  claimAmount,
  composeWeeklyReview,
  isMaterialDelta,
  CLAIM_STEP,
  type WeeklyReviewInput,
} from "./weekly-review";

// Regression suite for the 2026-08-10 push: "You spent $773 on
// day-to-day this week — $2,638 less than last week. $773 spent.
// Thursdays are still your soft spot." A $2,638 improvement delivered
// as surveillance, with the total repeated twice and a judgment tacked
// on the end. The composer's contract: every push is an offer, silence
// is a first-class outcome, and none of the old failure copy can recur.

const base: WeeklyReviewInput = {
  thisWeekTotal: 773,
  priorWeekTotal: 3411,
  claimTarget: { goalId: "g1", name: "Japan trip", remainingToTarget: 4000 },
  softSpot: { day: "Thursday", category: "dining" },
  incomeBlocked: false,
};

/** Every $-figure in the string, for duplicate detection. */
const dollarFigures = (s: string) =>
  [...s.matchAll(/\$[\d,]+/g)].map((m) => m[0]);

describe("the live regression case — the $773 / $2,638 week", () => {
  it("turns the win into a claim offer, not a spend report", () => {
    const push = composeWeeklyReview(base);
    expect(push?.kind).toBe("claim_win");
    // $2,638 win → 10% = $263.80 → floored to $250 steps of $25.
    expect(push?.claimSuggestion).toEqual({ goalId: "g1", name: "Japan trip", amount: 250 });
    expect(push?.body).toContain("$2,638");
    expect(push?.body).toContain("stayed with you");
    expect(push?.body).toContain("Japan trip");
  });

  it("never opens with 'You spent'", () => {
    const push = composeWeeklyReview(base)!;
    for (const text of [push.title, push.body, push.cardBody ?? ""]) {
      expect(text).not.toMatch(/^you spent/i);
      expect(text).not.toMatch(/\byou spent\b/i);
    }
  });

  it("never repeats the same dollar figure twice in one string", () => {
    const push = composeWeeklyReview(base)!;
    for (const text of [push.body, push.cardBody ?? ""]) {
      const figs = dollarFigures(text);
      expect(new Set(figs).size).toBe(figs.length);
    }
  });

  it("never emits the old judgment vocabulary", () => {
    for (const input of [
      base,
      { ...base, thisWeekTotal: 3411, priorWeekTotal: 773 }, // heavy week
    ]) {
      const push = composeWeeklyReview(input);
      if (!push) continue;
      const all = `${push.title} ${push.body} ${push.cardBody ?? ""}`;
      expect(all).not.toMatch(/soft spot/i);
      expect(all).not.toMatch(/\bstill\b/i);
    }
  });
});

describe("silence is a first-class outcome", () => {
  it("a flat week produces no push at all", () => {
    expect(
      composeWeeklyReview({ ...base, thisWeekTotal: 900, priorWeekTotal: 850 }),
    ).toBeNull();
  });

  it("a win with nowhere to point it produces no push", () => {
    expect(composeWeeklyReview({ ...base, claimTarget: null })).toBeNull();
  });

  it("a win too small to claim produces no push", () => {
    // Material delta ($150 on $500 base) but 10% → $15 < $25 step.
    expect(
      composeWeeklyReview({
        ...base,
        thisWeekTotal: 350,
        priorWeekTotal: 500,
      }),
    ).toBeNull();
  });

  it("a heavy week with no pattern to pre-commit against produces no push", () => {
    expect(
      composeWeeklyReview({
        ...base,
        thisWeekTotal: 3411,
        priorWeekTotal: 773,
        softSpot: null,
      }),
    ).toBeNull();
  });
});

describe("heavy week — forward offer, never a verdict", () => {
  it("offers a pre-commitment for the week ahead", () => {
    const push = composeWeeklyReview({
      ...base,
      thisWeekTotal: 3411,
      priorWeekTotal: 773,
    });
    expect(push?.kind).toBe("precommit_offer");
    expect(push?.frame).toBe("implementation_intention");
    expect(push?.body).toContain("Thursday");
    expect(push?.body).toContain("dining");
    // The heavy total itself is never quoted — the week is closed and
    // quoting it is a report, not an offer.
    expect(push?.body).not.toContain("$3,411");
    expect(push?.body).not.toContain("$2,638");
  });

  it("explicitly closes the door on the past week in the card", () => {
    const push = composeWeeklyReview({
      ...base,
      thisWeekTotal: 3411,
      priorWeekTotal: 773,
    });
    expect(push?.cardBody).toMatch(/nothing to fix/i);
  });
});

describe("income guard integration", () => {
  it("swaps the claim offer for the income question when blocked", () => {
    const push = composeWeeklyReview({ ...base, incomeBlocked: true });
    expect(push?.kind).toBe("income_question");
    expect(push?.body).toMatch(/two taps/i);
    expect(push?.claimSuggestion).toBeUndefined();
  });

  it("still stays silent on a flat week even when income is blocked", () => {
    // The income question rides ON a material win — it doesn't turn
    // every quiet Sunday into a nag.
    expect(
      composeWeeklyReview({
        ...base,
        incomeBlocked: true,
        thisWeekTotal: 900,
        priorWeekTotal: 850,
      }),
    ).toBeNull();
  });
});

describe("isMaterialDelta — both floors must clear", () => {
  it("absolute floor: $99 never fires regardless of share", () => {
    expect(isMaterialDelta(-99, 100)).toBe(false);
  });
  it("relative floor: $150 on a $4k baseline is noise", () => {
    expect(isMaterialDelta(-150, 4000)).toBe(false);
  });
  it("fires when both clear", () => {
    expect(isMaterialDelta(-2638, 3411)).toBe(true);
    expect(isMaterialDelta(500, 1000)).toBe(true);
  });
  it("zero prior week: any $100+ move fires (share floor is 0)", () => {
    expect(isMaterialDelta(250, 0)).toBe(true);
  });
});

describe("claimAmount", () => {
  it("10% floored to $25 steps", () => {
    expect(claimAmount(2638, 4000)).toBe(250);
    expect(claimAmount(1000, 4000)).toBe(100);
  });
  it("one step exactly when 10% lands on it", () => {
    expect(claimAmount(300, 4000)).toBe(CLAIM_STEP);
  });
  it("zero — not a bumped-up $25 — when 10% is below one step", () => {
    expect(claimAmount(240, 4000)).toBe(0);
    expect(claimAmount(150, 4000)).toBe(0);
  });
  it("capped at what the goal still needs", () => {
    expect(claimAmount(2638, 80)).toBe(80);
  });
  it("zero when there is no win or no need", () => {
    expect(claimAmount(0, 4000)).toBe(0);
    expect(claimAmount(2638, 0)).toBe(0);
  });
});
