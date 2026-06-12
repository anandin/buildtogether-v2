import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  cadenceStepDays,
  computePaydayAllocation,
  scorecardLine,
  templatePushBody,
} from "./payday-brief";

describe("addDaysIso — TZ-safe date walking", () => {
  it("walks across month boundaries", () => {
    expect(addDaysIso("2026-06-25", 14)).toBe("2026-07-09");
  });
  it("walks backwards for the yesterday window", () => {
    expect(addDaysIso("2026-06-12", -1)).toBe("2026-06-11");
  });
  it("handles year boundaries", () => {
    expect(addDaysIso("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("computePaydayAllocation — the cycle ledger", () => {
  const paycheck = {
    paycheckAmount: 6744.58,
    paydayDate: "2026-06-11",
    cadence: "biweekly" as const,
  };

  it("computes truly-free = paycheck − bills − expected variable", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      billsDue: [
        { merchant: "Rent", amount: 2200, date: "2026-06-15" },
        { merchant: "Spotify", amount: 12.99, date: "2026-06-20" },
      ],
      dailyPace: 156,
      dream: null,
    });
    expect(a.nextPaydayDate).toBe("2026-06-25");
    expect(a.cycleDays).toBe(14);
    expect(a.billsTotal).toBe(2213);
    expect(a.expectedVariable).toBe(2184); // 156 × 14
    expect(a.trulyFree).toBe(Math.round(6744.58 - 2213 - 2184));
  });

  it("goes negative honestly when the cycle is overcommitted", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      paycheckAmount: 1200,
      billsDue: [{ merchant: "Rent", amount: 1100, date: "2026-06-15" }],
      dailyPace: 50,
      dream: null,
    });
    expect(a.trulyFree).toBeLessThan(0);
    expect(templatePushBody(a)).toContain("Heads up");
  });

  it("suggests a $25-stepped dream sweep capped at the remaining target", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      billsDue: [],
      dailyPace: 100, // free = 6744.58 − 1400 ≈ 5345
      dream: { id: "g1", name: "Tokyo", targetAmount: 3000, savedAmount: 2900 },
    });
    // 10% of ~5345 = 534 → floor to $525, but only $100 remains to target.
    expect(a.dreamSuggestion).toEqual({ goalId: "g1", name: "Tokyo", amount: 100 });
  });

  it("does NOT suggest a sweep when the cycle is tight (< $100 free)", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      paycheckAmount: 2300,
      billsDue: [{ merchant: "Rent", amount: 1100, date: "2026-06-15" }],
      dailyPace: 80, // free = 2300 − 1100 − 1120 = 80
      dream: { id: "g1", name: "Tokyo", targetAmount: 3000, savedAmount: 0 },
    });
    expect(a.dreamSuggestion).toBeNull();
  });

  it("does NOT suggest a sweep for an already-completed dream", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      billsDue: [],
      dailyPace: 0,
      dream: { id: "g1", name: "Tokyo", targetAmount: 3000, savedAmount: 3000 },
    });
    expect(a.dreamSuggestion).toBeNull();
  });

  it("falls back to a 14-day cycle when cadence is irregular", () => {
    const a = computePaydayAllocation({
      ...paycheck,
      cadence: "irregular",
      billsDue: [],
      dailyPace: 100,
      dream: null,
    });
    expect(a.nextPaydayDate).toBeNull();
    expect(a.cycleDays).toBe(14);
  });
});

describe("cadenceStepDays", () => {
  it("maps weekly/biweekly/monthly and rejects the rest", () => {
    expect(cadenceStepDays("weekly")).toBe(7);
    expect(cadenceStepDays("biweekly")).toBe(14);
    expect(cadenceStepDays("monthly")).toBe(30);
    expect(cadenceStepDays("irregular")).toBeNull();
    expect(cadenceStepDays("unknown")).toBeNull();
  });
});

describe("scorecardLine — last cycle accountability", () => {
  it("reads ahead-of-plan", () => {
    expect(scorecardLine({ predictedFree: 2300, actualFree: 2510, delta: 210 })).toContain(
      "$210 ahead of plan",
    );
  });
  it("reads past-plan honestly", () => {
    expect(scorecardLine({ predictedFree: 2300, actualFree: 1900, delta: -400 })).toContain(
      "$400 past plan",
    );
  });
  it("calls small deltas on-plan instead of nitpicking", () => {
    expect(scorecardLine({ predictedFree: 2300, actualFree: 2310, delta: 10 })).toContain("on plan");
  });
  it("is empty with no prior cycle", () => {
    expect(scorecardLine(null)).toBe("");
  });
});

describe("templatePushBody — the LLM-down fallback", () => {
  it("puts the split inline with no tap-bait", () => {
    const a = computePaydayAllocation({
      paycheckAmount: 6744.58,
      paydayDate: "2026-06-11",
      cadence: "biweekly",
      billsDue: [{ merchant: "Rent", amount: 2200, date: "2026-06-15" }],
      dailyPace: 156,
      dream: null,
    });
    const body = templatePushBody(a);
    expect(body).toContain("$6,745");
    expect(body).toContain("truly yours");
    expect(body.toLowerCase()).not.toContain("tap to see");
  });
});
