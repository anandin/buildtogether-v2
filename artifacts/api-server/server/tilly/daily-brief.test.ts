import { describe, expect, it } from "vitest";

import {
  type DailyBriefInput,
  briefNumbersValid,
  dollarFiguresIn,
  harvestAllowedNumbers,
  assertsSurplus,
  briefRespectsIncomeGuard,
  incomeGuardContext,
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

// ── Income guard ─────────────────────────────────────────────────────
// Phase 0, commitment-layer PRD. The hero must not assert spare capacity
// while the income denominator is unverified — the 2026-05-16 audit had
// it confidently wrong by half, in the doom direction.

const blocked = {
  level: "low" as const,
  countedMonthly: 6745,
  unreviewedMonthly: 5571,
  quarantinedMonthly: 0,
  unreviewedShare: 0.452,
  quarantinedShare: 0,
  reasons: ["About 45% of what looks like income isn't counted as income yet."],
  blocksSurplusClaims: true,
};

describe("assertsSurplus", () => {
  it.each([
    "*$2,340* surplus this month — room for the Switch 2 dream.",
    "You've got $2,340 of breathing room.",
    "There's room for dinner out this week.",
    "You can afford the jacket.",
    "$400 left over after the Visa.",
    "Nice buffer — you've earned a treat.",
    "Go enjoy the coffee.",
    "Plenty in the tank this cycle.",
  ])("flags %j as a surplus claim", (line) => {
    expect(assertsSurplus(line)).toBe(true);
  });

  it.each([
    "May 18 CRA bill is the pressure point — next paycheck lands 10 days after.",
    "Sub load crept up $34/mo since Jan — worth pruning.",
    "Heavier month, but $4,908 of it is a one-off tax instalment, not a pattern.",
    "Some of your income isn't counted yet — I'd rather check than guess.",
    "Tight month — let's see what's still movable.",
  ])("leaves neutral copy alone: %j", (line) => {
    expect(assertsSurplus(line)).toBe(false);
  });
});

describe("briefRespectsIncomeGuard", () => {
  it("rejects a surplus claim in any generated field", () => {
    expect(
      briefRespectsIncomeGuard({ bodyLine: "*$2,340* surplus this month." }),
    ).toBe(false);
    expect(
      briefRespectsIncomeGuard({ heroNarrative: "You can afford the trip." }),
    ).toBe(false);
    expect(
      briefRespectsIncomeGuard({ tillyInvite: "Want to spend some of that spare cash?" }),
    ).toBe(false);
  });

  it("passes the deterministic degrade copy the guard falls back to", () => {
    expect(
      briefRespectsIncomeGuard({
        bodyLine:
          "*Some of your income isn't counted yet* — I'd rather check than guess at what's spare.",
        tillyInvite: "Want to sort out which deposits are actually income?",
        heroNarrative: "",
      }),
    ).toBe(true);
  });

  it("ignores empty and missing fields", () => {
    expect(briefRespectsIncomeGuard({})).toBe(true);
    expect(briefRespectsIncomeGuard({ bodyLine: "", heroNarrative: "" })).toBe(true);
  });
});

describe("incomeGuardContext", () => {
  it("is empty when income is trusted — no prompt cost on the happy path", () => {
    expect(incomeGuardContext(null)).toBe("");
    expect(incomeGuardContext(undefined)).toBe("");
    expect(incomeGuardContext({ ...blocked, level: "high", blocksSurplusClaims: false })).toBe("");
  });

  it("forbids reassurance AND alarm, not just reassurance", () => {
    const ctx = incomeGuardContext(blocked);
    expect(ctx).toMatch(/HARD CONSTRAINT/);
    expect(ctx).toMatch(/do NOT warn them that they are short/i);
    expect(ctx).toMatch(/isn't counted yet/i);
  });

  it("passes the specific reasons through so the copy can be concrete", () => {
    expect(incomeGuardContext(blocked)).toContain(blocked.reasons[0]);
  });
});
