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

// ── Phase 2: the live choice + what the commitment layer did ─────────

import { sweepsLine } from "./payday-brief";

describe("computePaydayAllocation — options (PRD F1)", () => {
  const input = {
    paycheckAmount: 6745,
    paydayDate: "2026-08-06",
    cadence: "biweekly" as const,
    billsDue: [{ merchant: "Rent", amount: 2400, date: "2026-08-10" }],
    dailyPace: 100, // ×14 = 1400 → trulyFree = 6745 − 2400 − 1400 = 2945
    dream: null,
    goals: [
      { id: "g1", name: "Japan trip", targetAmount: 5000, savedAmount: 1000, currentPerPayday: 0 },
      { id: "g2", name: "Emergency", targetAmount: 3000, savedAmount: 2900, currentPerPayday: 100 },
      { id: "g3", name: "Done already", targetAmount: 500, savedAmount: 500 },
    ],
  };

  it("offers one option per goal with room, plus 'leave it liquid'", () => {
    const a = computePaydayAllocation(input);
    expect(a.trulyFree).toBe(2945);
    const kinds = a.options.map((o) => o.kind);
    expect(kinds).toEqual(["goal", "goal", "liquid"]);
    expect(a.options.some((o) => o.kind === "goal" && o.goalId === "g3")).toBe(false);
  });

  it("sizes each option at 10% in $25 steps, capped at what's left", () => {
    const a = computePaydayAllocation(input);
    const japan = a.options.find((o) => o.kind === "goal" && o.goalId === "g1");
    const emerg = a.options.find((o) => o.kind === "goal" && o.goalId === "g2");
    // 10% of 2945 = 294.5 → $275.
    expect(japan && japan.kind === "goal" ? japan.amount : 0).toBe(275);
    // Emergency has $100 left → capped.
    expect(emerg && emerg.kind === "goal" ? emerg.amount : 0).toBe(100);
  });

  it("carries a consequence: paydays to target, and how many sooner than today's pace", () => {
    const a = computePaydayAllocation(input);
    const japan = a.options.find((o) => o.kind === "goal" && o.goalId === "g1");
    if (!japan || japan.kind !== "goal") throw new Error("missing");
    expect(japan.paydaysToTarget).toBe(Math.ceil(4000 / 275));
    expect(japan.paydaysSooner).toBe(0); // no current commitment → nothing to compare
    const emerg = a.options.find((o) => o.kind === "goal" && o.goalId === "g2");
    if (!emerg || emerg.kind !== "goal") throw new Error("missing");
    expect(emerg.currentPerPayday).toBe(100);
  });

  it("offers nothing on a thin cycle — no token asks", () => {
    const a = computePaydayAllocation({ ...input, dailyPace: 300 }); // trulyFree = 145 ≥ 100 but 10% → $0 steps
    expect(a.options.filter((o) => o.kind === "goal").every((o) => o.kind === "goal" && o.amount >= 25)).toBe(true);
    const thin = computePaydayAllocation({ ...input, dailyPace: 320 }); // trulyFree = −135
    expect(thin.options).toEqual([]);
  });

  it("never lists a liability — none are ingested, and a fake one is invented abundance", () => {
    const a = computePaydayAllocation(input);
    expect(a.options.every((o) => o.kind === "goal" || o.kind === "liquid")).toBe(true);
  });
});

describe("sweepsLine — what happened, in the app's own honest verb", () => {
  it("says 'set aside', never 'saved' or 'moved'", () => {
    const line = sweepsLine([{ goalName: "Japan trip", amount: 250 }], []);
    expect(line).toBe("Set aside $250 for Japan trip, as agreed.");
    expect(line).not.toMatch(/\bsaved\b|\bmoved\b/i);
  });
  it("lists several sweeps naturally", () => {
    expect(sweepsLine([{ goalName: "Japan", amount: 250 }, { goalName: "Emergency", amount: 100 }], [])).toBe(
      "Set aside $250 for Japan and $100 for Emergency, as agreed.",
    );
  });
  it("thin cycle: names the skip, keeps the commitment, no verdict", () => {
    const line = sweepsLine([], [{ reason: "no_room" }]);
    expect(line).toMatch(/picks back up next paycheque/);
    expect(line).not.toMatch(/\bstill\b|overspent|too much/i);
  });
  it("silent when nothing ran and nothing was skipped for room", () => {
    expect(sweepsLine([], [])).toBe("");
    expect(sweepsLine([], [{ reason: "already_done" }])).toBe("");
  });
});

describe("computePaydayAllocation — liability forks (open item 6)", () => {
  it("offers a paydown fork with a real balance and a clear-by date", () => {
    const a = computePaydayAllocation({
      paycheckAmount: 6745,
      paydayDate: "2026-08-06",
      cadence: "biweekly",
      billsDue: [],
      dailyPace: 100, // trulyFree = 6745 − 1400 = 5345 → 10% = $525
      dream: null,
      goals: [],
      liabilities: [{ accountId: "acc1", name: "TD Visa", balance: 4302 }],
    });
    const visa = a.options.find((o) => o.kind === "liability");
    if (!visa || visa.kind !== "liability") throw new Error("missing liability option");
    expect(visa.amount).toBe(525);
    expect(visa.paydaysToClear).toBe(Math.ceil(4302 / 525)); // 9
    expect(visa.clearBy).toBe(addDaysIso("2026-08-06", 14 * 9));
    expect(a.options[a.options.length - 1].kind).toBe("liquid");
  });

  it("skips a zero balance — nothing to pay down is not a fork", () => {
    const a = computePaydayAllocation({
      paycheckAmount: 6745, paydayDate: "2026-08-06", cadence: "biweekly", billsDue: [], dailyPace: 100, dream: null,
      goals: [], liabilities: [{ accountId: "acc1", name: "Paid card", balance: 0 }],
    });
    expect(a.options).toEqual([]);
  });
});

describe("sweepsLine — escalation notice", () => {
  it("names the rule acting, the old and new amount, and the undo", () => {
    const line = sweepsLine(
      [{ goalName: "Japan trip", amount: 350 }],
      [],
      [{ goalName: "Japan trip", from: 250, to: 350, paycheckDelta: 400 }],
    );
    expect(line).toMatch(/up \$400/);
    expect(line).toMatch(/now \$350 \(was \$250\)/);
    expect(line).toMatch(/undoes it/);
    expect(line).toMatch(/Set aside \$350 for Japan trip, as agreed\.$/);
  });
});
