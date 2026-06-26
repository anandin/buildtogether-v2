import { describe, expect, it } from "vitest";

import {
  type DailyBriefInput,
  briefNumbersValid,
  dollarFiguresIn,
  harvestAllowedNumbers,
} from "./daily-brief";

// Fabrication guard regression suite — the chat validator never covered
// the brief, which is exactly where the $173,496 hero bug surfaced.

const baseInput: DailyBriefInput = {
  userId: "u1",
  householdId: "h1",
  name: "Anand",
  tone: "sibling" as never,
  now: "2026-06-12T12:00:00Z",
  numbers: { breathing: 2446, afterRent: 2446, paycheckCopy: "~$156/day pace" },
  recentMemorySnippets: [],
  forwardLook: {
    daysIntoMonth: 12,
    daysInMonth: 30,
    dailyPace: 156,
    projectedClose: 2446,
    variableSoFar: 1872,
    fixedSoFar: 6218,
    incomeProjected: 13344,
    incomeProjection: {
      projectedRemaining: 6599.89,
      cadence: "biweekly",
      typicalAmount: 6599.89,
      nextPaycheckDate: "2026-06-25",
    },
  },
};

describe("dollarFiguresIn", () => {
  it("parses comma-grouped and decimal figures", () => {
    expect(dollarFiguresIn("you'll get $173,496 and spend $156.50")).toEqual([173496, 157]);
  });
  it("returns empty for text with no dollar figures", () => {
    expect(dollarFiguresIn("nothing to see here")).toEqual([]);
  });
});

describe("harvestAllowedNumbers + briefNumbersValid", () => {
  it("accepts phrasing that only uses provided numbers", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    expect(
      briefNumbersValid(
        {
          bodyLine: "*$2,446* projected by month-end.",
          heroNarrative: "Next paycheck $6,600 lands June 25 — pace is $156/day.",
          tillyInvite: "Want to look at the $1,872 variable spend?",
        },
        allowed,
      ),
    ).toBe(true);
  });

  it("rejects a fabricated figure (the $173,496 class)", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    expect(
      briefNumbersValid(
        {
          bodyLine: "*$2,446* projected by month-end.",
          heroNarrative: "You'll get $173,496 before end of this month.",
          tillyInvite: "",
        },
        allowed,
      ),
    ).toBe(false);
  });

  it("tolerates floor/round/ceil variants of real numbers", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    // typicalAmount is 6599.89 — both $6,599 and $6,600 must pass.
    expect(briefNumbersValid({ bodyLine: "$6,599 typical", heroNarrative: "$6,600 coming", tillyInvite: "" }, allowed)).toBe(true);
  });

  it("allows simple sums/differences of headline numbers", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    // variableSoFar + fixedSoFar = 8090 — legitimate "spent so far" phrasing.
    expect(briefNumbersValid({ bodyLine: "$8,090 out the door so far", heroNarrative: "", tillyInvite: "" }, allowed)).toBe(true);
  });

  it("ignores small colour figures under $10", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    expect(briefNumbersValid({ bodyLine: "skip the $6 latte", heroNarrative: "", tillyInvite: "" }, allowed)).toBe(true);
  });

  it("allows a legitimate mid-size figure we didn't harvest (category total)", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    // $542 shopping total is real but not in the harvested set; it's well
    // within 1.5x the largest real number (~$13k) so it must NOT degrade
    // the narrative. This is the false-positive that blanked the hero.
    expect(
      briefNumbersValid(
        { bodyLine: "Shopping is your biggest line at $542.", heroNarrative: "", tillyInvite: "" },
        allowed,
      ),
    ).toBe(true);
  });

  it("still rejects an implausibly large figure above the ceiling", () => {
    const allowed = harvestAllowedNumbers(baseInput);
    // 1.5x of ~$13,344 is ~$20k; $173,496 clears it → rejected.
    expect(
      briefNumbersValid({ bodyLine: "$173,496 incoming", heroNarrative: "", tillyInvite: "" }, allowed),
    ).toBe(false);
  });
});
