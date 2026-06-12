import { describe, expect, it } from "vitest";

import {
  dedupeIncomeRows,
  medianIncomeAmount,
  splitAnomalousIncome,
} from "./income-summary";

// Regression suite for the "$173,496 before end of this month" Home-hero
// bug. The income read path had none of the spend path's defenses, so
// three independent pollution vectors inflated incomeProjected:
//   1. Plaid-removed pending ghosts (status='ignored') double-counting —
//      guarded by the ne(status,'ignored') filter (DB-level, not testable
//      here) plus the dedupe below.
//   2. Bank re-posted deposits (fresh plaid id, same date/amount/merchant).
//   3. Misclassified TRANSFER_IN credits (inter-account moves, incoming
//      e-transfers) feeding a MEAN-based typical-paycheck.

describe("dedupeIncomeRows — collapse re-posted / pending-posted twins", () => {
  it("collapses same-day same-amount same-merchant rows", () => {
    const rows = [
      { amount: -2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
      { amount: -2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
      { amount: -2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
    ];
    expect(dedupeIncomeRows(rows)).toHaveLength(1);
  });

  it("keys on |amount| so a sign-flipped twin still collapses", () => {
    const rows = [
      { amount: -2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
      { amount: 2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
    ];
    expect(dedupeIncomeRows(rows)).toHaveLength(1);
  });

  it("keeps genuinely distinct paychecks (different dates)", () => {
    const rows = [
      { amount: -2150.25, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
      { amount: -2150.25, date: "2026-06-19", merchantName: "ACME PAYROLL", name: "" },
    ];
    expect(dedupeIncomeRows(rows)).toHaveLength(2);
  });

  it("keeps same-day twin paychecks from different employers", () => {
    const rows = [
      { amount: -500, date: "2026-06-05", merchantName: "ACME PAYROLL", name: "" },
      { amount: -500, date: "2026-06-05", merchantName: "CAMPUS JOB", name: "" },
    ];
    expect(dedupeIncomeRows(rows)).toHaveLength(2);
  });

  it("falls back to `name` when merchantName is null (bank descriptors)", () => {
    const rows = [
      { amount: -500, date: "2026-06-05", merchantName: null, name: "DEPOSIT 123" },
      { amount: -500, date: "2026-06-05", merchantName: null, name: "DEPOSIT 123" },
    ];
    expect(dedupeIncomeRows(rows)).toHaveLength(1);
  });
});

describe("medianIncomeAmount — robust typical paycheck", () => {
  it("ignores one giant pollutant where a mean would not", () => {
    const paychecks = [-1700, -1750, -1734.96, -1720, -1740, -86748].map(
      (amount, i) => ({ amount, date: `2026-04-0${i + 1}` }),
    );
    const median = medianIncomeAmount(paychecks);
    expect(median).toBeGreaterThan(1700);
    expect(median).toBeLessThan(1800);
    // The old mean-based typicalAmount was the bug:
    const mean = paychecks.reduce((s, r) => s + Math.abs(r.amount), 0) / paychecks.length;
    expect(mean).toBeGreaterThan(15000); // demonstrates why mean was wrong
  });

  it("returns 0 for empty input", () => {
    expect(medianIncomeAmount([])).toBe(0);
  });
});

describe("splitAnomalousIncome — quarantine non-paycheck credits", () => {
  it("flags a five-figure transfer among normal paychecks", () => {
    const rows = [
      { amount: -1734.96, date: "2026-05-01" },
      { amount: -1734.96, date: "2026-05-15" },
      { amount: -1734.96, date: "2026-05-29" },
      { amount: -86748, date: "2026-06-02", merchantName: "TD TRANSFER IN" },
    ];
    const { typical, anomalous } = splitAnomalousIncome(rows);
    expect(anomalous).toHaveLength(1);
    expect(Math.abs(anomalous[0].amount)).toBe(86748);
    expect(typical).toHaveLength(3);
  });

  it("does NOT flag a normal raise or bonus-sized variation (< 3× median)", () => {
    const rows = [
      { amount: -1700, date: "2026-05-01" },
      { amount: -1700, date: "2026-05-15" },
      { amount: -3400, date: "2026-05-29" }, // double pay period — exactly 2× median
    ];
    const { anomalous } = splitAnomalousIncome(rows);
    expect(anomalous).toHaveLength(0);
  });

  it("never flags small credits even when median is tiny ($1000 floor)", () => {
    const rows = [
      { amount: -40, date: "2026-05-01" }, // e-transfers from friends
      { amount: -25, date: "2026-05-03" },
      { amount: -300, date: "2026-05-10" }, // > 3× median but < $1000
    ];
    const { anomalous } = splitAnomalousIncome(rows);
    expect(anomalous).toHaveLength(0);
  });

  it("treats a single row as typical — no baseline to judge against", () => {
    const rows = [{ amount: -86748, date: "2026-06-02" }];
    const { typical, anomalous } = splitAnomalousIncome(rows);
    expect(typical).toHaveLength(1);
    expect(anomalous).toHaveLength(0);
  });

  it("with two wildly different rows, quarantines the big one (lower median)", () => {
    const rows = [
      { amount: -2000, date: "2026-05-15" },
      { amount: -86748, date: "2026-06-02" },
    ];
    const { typical, anomalous } = splitAnomalousIncome(rows);
    expect(typical.map((r) => Math.abs(r.amount))).toEqual([2000]);
    expect(anomalous.map((r) => Math.abs(r.amount))).toEqual([86748]);
  });

  it("routes a CONFIRMED anomaly to confirmedOneOff — counted, never cadence", () => {
    const rows = [
      { amount: -1734.96, date: "2026-05-01" },
      { amount: -1734.96, date: "2026-05-15" },
      { amount: -70396.7, date: "2026-05-28", merchantName: "CSA GROUP TESTI PAY" },
    ];
    const confirmed = new Set(["2026-05-28|70396.70"]);
    const { typical, anomalous, confirmedOneOff } = splitAnomalousIncome(rows, confirmed);
    expect(anomalous).toHaveLength(0);
    expect(confirmedOneOff.map((r) => Math.abs(r.amount))).toEqual([70396.7]);
    expect(typical).toHaveLength(2); // paychecks untouched
  });

  it("an unconfirmed anomaly stays quarantined even when others are confirmed", () => {
    const rows = [
      { amount: -1700, date: "2026-05-01" },
      { amount: -1700, date: "2026-05-15" },
      { amount: -70396.7, date: "2026-05-28" },
      { amount: -25000, date: "2026-06-03" },
    ];
    const confirmed = new Set(["2026-05-28|70396.70"]);
    const { anomalous, confirmedOneOff } = splitAnomalousIncome(rows, confirmed);
    expect(confirmedOneOff).toHaveLength(1);
    expect(anomalous.map((r) => Math.abs(r.amount))).toEqual([25000]);
  });
});
