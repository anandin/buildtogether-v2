import { describe, expect, it } from "vitest";

import {
  assessIncomeConfidence,
  estimateMonthlyFromWindow,
  BLOCK_UNREVIEWED_SHARE,
  BLOCK_QUARANTINED_SHARE,
} from "./income-review";

// Regression suite for the abundance denominator. The 2026-05-16
// perception audit found the live account projecting off ~$6,745/mo when
// real income was ~$15k+, because several real paycheques sat in
// `transfers` / `credit_adjustment`. Every "you have room" claim built on
// that number was false. These tests pin the verdict that stops such
// claims from shipping.

const clean = {
  countedMonthly: 6745,
  unreviewedMonthly: 0,
  quarantinedMonthly: 0,
  observedPaychecks: 6,
};

describe("assessIncomeConfidence — the live regression case", () => {
  it("blocks surplus claims when a real paycheque is bucketed as transfers", () => {
    // CSA Group MSP ($5,571/mo) misclassified as credit_adjustment.
    const c = assessIncomeConfidence({ ...clean, unreviewedMonthly: 5571 });
    expect(c.level).toBe("low");
    expect(c.blocksSurplusClaims).toBe(true);
    expect(c.unreviewedShare).toBeGreaterThan(0.4);
    expect(c.reasons.join(" ")).toMatch(/isn't counted as income/i);
  });

  it("stays blocked when several streams are unreviewed at once", () => {
    // All four audit candidates: 5571 + 5128 + 4302 + 750.
    const c = assessIncomeConfidence({ ...clean, unreviewedMonthly: 15751 });
    expect(c.level).toBe("low");
    expect(c.blocksSurplusClaims).toBe(true);
  });

  it("clears once the user has confirmed or dismissed every candidate", () => {
    const c = assessIncomeConfidence(clean);
    expect(c.level).toBe("high");
    expect(c.blocksSurplusClaims).toBe(false);
    expect(c.reasons).toEqual([]);
  });
});

describe("assessIncomeConfidence — under-count (unreviewed inflow)", () => {
  it("warns without blocking in the 5–15% band", () => {
    // ~8% of plausible income unreviewed.
    const c = assessIncomeConfidence({ ...clean, unreviewedMonthly: 600 });
    expect(c.level).toBe("medium");
    expect(c.blocksSurplusClaims).toBe(false);
    expect(c.reasons).toHaveLength(1);
  });

  it("ignores a trivial one-off reimbursement", () => {
    const c = assessIncomeConfidence({ ...clean, unreviewedMonthly: 120 });
    expect(c.level).toBe("high");
  });

  it("blocks exactly at the threshold, not just past it", () => {
    // Solve unreviewed / (counted + unreviewed) === BLOCK_UNREVIEWED_SHARE.
    const counted = 6745;
    const unreviewed =
      (counted * BLOCK_UNREVIEWED_SHARE) / (1 - BLOCK_UNREVIEWED_SHARE);
    const c = assessIncomeConfidence({
      ...clean,
      countedMonthly: counted,
      unreviewedMonthly: unreviewed,
    });
    expect(c.unreviewedShare).toBeCloseTo(BLOCK_UNREVIEWED_SHARE, 3);
    expect(c.blocksSurplusClaims).toBe(true);
  });
});

describe("assessIncomeConfidence — over-count (quarantined deposits)", () => {
  it("blocks when a large deposit is held out of the month total", () => {
    // The $86,748 deposit from the daily-brief incomeNote comment.
    const c = assessIncomeConfidence({ ...clean, quarantinedMonthly: 86748 });
    expect(c.level).toBe("low");
    expect(c.blocksSurplusClaims).toBe(true);
    expect(c.quarantinedShare).toBeGreaterThan(BLOCK_QUARANTINED_SHARE);
    expect(c.reasons.join(" ")).toMatch(/held out of the total/i);
  });

  it("warns on a modest held-back deposit", () => {
    const c = assessIncomeConfidence({ ...clean, quarantinedMonthly: 700 });
    expect(c.level).toBe("medium");
    expect(c.blocksSurplusClaims).toBe(false);
  });
});

describe("assessIncomeConfidence — no baseline", () => {
  it("blocks when no income has been identified but money is arriving", () => {
    const c = assessIncomeConfidence({
      countedMonthly: 0,
      unreviewedMonthly: 4300,
      quarantinedMonthly: 0,
      observedPaychecks: 0,
    });
    expect(c.level).toBe("low");
    expect(c.reasons[0]).toMatch(/none of it is classified as income/i);
  });

  it("blocks on a fresh account with no income data at all", () => {
    const c = assessIncomeConfidence({
      countedMonthly: 0,
      unreviewedMonthly: 0,
      quarantinedMonthly: 0,
      observedPaychecks: 0,
    });
    expect(c.level).toBe("low");
    expect(c.reasons[0]).toMatch(/No income detected yet/i);
  });

  it("blocks on a single observed paycheque — no baseline to judge against", () => {
    const c = assessIncomeConfidence({ ...clean, observedPaychecks: 1 });
    expect(c.level).toBe("low");
    expect(c.reasons[0]).toMatch(/Only 1 paycheque observed/i);
  });

  it("clears at two observed paycheques", () => {
    const c = assessIncomeConfidence({ ...clean, observedPaychecks: 2 });
    expect(c.level).toBe("high");
  });
});

describe("assessIncomeConfidence — hygiene", () => {
  it("never reports a negative or NaN share", () => {
    const c = assessIncomeConfidence({
      countedMonthly: -500,
      unreviewedMonthly: -100,
      quarantinedMonthly: 0,
      observedPaychecks: 3,
    });
    expect(c.unreviewedShare).toBe(0);
    expect(Number.isNaN(c.unreviewedShare)).toBe(false);
    expect(c.countedMonthly).toBe(0);
  });

  it("reports the most severe reason first when both directions fire", () => {
    const c = assessIncomeConfidence({
      ...clean,
      unreviewedMonthly: 5571,
      quarantinedMonthly: 86748,
    });
    expect(c.level).toBe("low");
    expect(c.reasons.length).toBeGreaterThanOrEqual(2);
  });
});

describe("estimateMonthlyFromWindow", () => {
  it("halves a 60-day observation to a monthly figure", () => {
    // Two $5,571 hits over 60 days → one per month.
    expect(estimateMonthlyFromWindow(5571, 2)).toBeCloseTo(5571, 0);
  });

  it("scales biweekly deposits correctly", () => {
    // Four $2,000 hits over 60 days → ~$4,000/mo.
    expect(estimateMonthlyFromWindow(2000, 4)).toBeCloseTo(4000, 0);
  });

  it("returns 0 for empty or nonsensical input", () => {
    expect(estimateMonthlyFromWindow(0, 5)).toBe(0);
    expect(estimateMonthlyFromWindow(500, 0)).toBe(0);
    expect(estimateMonthlyFromWindow(-500, 3)).toBe(0);
  });
});
