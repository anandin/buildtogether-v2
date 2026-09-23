import { describe, expect, it } from "vitest";

import { inferRecurring, normalizeMerchant } from "./recurring-infer";

describe("inferRecurring", () => {
  it("detects a monthly stream and ignores a one-off pair", () => {
    const rows = [
      { merchant: "NETFLIX.COM", amount: 15.99, date: "2026-06-12", category: "subscriptions" },
      { merchant: "NETFLIX.COM", amount: 15.99, date: "2026-07-12", category: "subscriptions" },
      { merchant: "NETFLIX.COM", amount: 16.49, date: "2026-08-12", category: "subscriptions" },
      { merchant: "Blue Bottle", amount: 6.5, date: "2026-08-01", category: "restaurants" },
      { merchant: "Blue Bottle", amount: 7.25, date: "2026-08-20", category: "restaurants" },
      { merchant: "TRANSFER TO SAVINGS", amount: 200, date: "2026-07-01", category: "transfers" },
      { merchant: "TRANSFER TO SAVINGS", amount: 200, date: "2026-08-01", category: "transfers" },
    ];
    const found = inferRecurring(rows, "2026-09-01");
    expect(found).toHaveLength(1);
    expect(found[0]!.merchant).toBe("NETFLIX.COM");
    expect(found[0]!.cadence).toBe("monthly");
    expect(found[0]!.cadenceDays).toBe(30);
    expect(found[0]!.nextChargeAt >= "2026-09-01").toBe(true);
    expect(found[0]!.occurrences).toBe(3);
  });

  it("normalizes noisy descriptors so the same biller groups together", () => {
    expect(normalizeMerchant("SPOTIFY USA  #4421")).toBe("spotify usa 4421");
    expect(normalizeMerchant("ACH DEBIT NETFLIX")).toContain("netflix");
  });

  it("accepts a weekly transit pass with three regular charges", () => {
    const rows = [
      { merchant: "PRESTO", amount: 40, date: "2026-08-03", category: "transport" },
      { merchant: "PRESTO", amount: 40, date: "2026-08-10", category: "transport" },
      { merchant: "PRESTO", amount: 40, date: "2026-08-17", category: "transport" },
    ];
    const found = inferRecurring(rows, "2026-08-20");
    expect(found).toHaveLength(1);
    expect(found[0]!.cadence).toBe("weekly");
  });
});
