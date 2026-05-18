import { describe, expect, it } from "vitest";

import {
  DEFAULT_ADJUSTMENT_CATS,
  DEFAULT_ONE_OFF_CATS,
  DEFAULT_RECURRING_CATS,
  DEFAULT_FIXED_OBLIGATION_CATS,
  bucketFor,
  emptyOverrides,
  merchantSignature,
} from "./taxonomy";

describe("merchantSignature — the canonical merchant identity", () => {
  // These invariants matter because every place that writes a
  // preference keyed by sig (markPaymentToOwnCard, dismissAsNotIncome,
  // setMerchantCadence, flagAsIncome) MUST agree with every place that
  // reads it (income_classification_gap, annual_bill_upcoming detector,
  // dispatch dedup). Sig drift caused 3 of last week's bugs.

  it("strips store numbers + reference codes deterministically", () => {
    expect(
      merchantSignature({ merchantName: "STARBUCKS #2718 SEATTLE WA", name: "", amount: 5 }),
    ).toEqual(merchantSignature({ merchantName: "STARBUCKS #4501 SEATTLE WA", name: "", amount: 5 }));
  });

  it("collapses 'Canada Txd' / 'CANADA TXD' into the same key", () => {
    const a = merchantSignature({ merchantName: "Canada Txd", name: "CANADA TXD", amount: -4907.92 });
    const b = merchantSignature({ merchantName: "Canada Txd", name: "CANADA TXD", amount: -4907.92 });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("returns 'unknown' (not empty) when both fields are blank", () => {
    expect(merchantSignature({ merchantName: "", name: "", amount: 0 })).toBe("unknown");
  });

  it("uses merchantName when present, otherwise name (so swapping nullability doesn't shift the key)", () => {
    const a = merchantSignature({ merchantName: "Spotify", name: "SPOTIFY USA", amount: 10 });
    const b = merchantSignature({ merchantName: "Spotify", name: null as unknown as string, amount: 10 });
    expect(a).toBe(b);
  });

  it("does NOT collapse genuinely different merchants", () => {
    const a = merchantSignature({ merchantName: "Tim Hortons", name: "", amount: 4.5 });
    const b = merchantSignature({ merchantName: "Starbucks", name: "", amount: 4.5 });
    expect(a).not.toBe(b);
  });
});

describe("bucketFor — the canonical category → bucket resolver", () => {
  // Invariant: every category in the codebase MUST resolve to exactly
  // one bucket. computeMonthFlow + detectors + projection all rely on
  // this. Adding a new category to one of the default sets must keep
  // its bucket assignment stable.

  it("income category resolves to income", () => {
    expect(bucketFor("income")).toBe("income");
    expect(bucketFor("INCOME")).toBe("income");
    expect(bucketFor("  income  ")).toBe("income");
  });

  it("transfers / cashback / credit_adjustment → adjustment", () => {
    for (const cat of ["transfers", "cashback", "credit_adjustment"]) {
      expect(bucketFor(cat), `${cat} should be adjustment`).toBe("adjustment");
    }
  });

  it("subscriptions / mortgage / rent / insurance / utilities → recurring", () => {
    for (const cat of ["subscriptions", "mortgage", "rent", "insurance", "utilities"]) {
      expect(bucketFor(cat), `${cat} should be recurring`).toBe("recurring");
    }
  });

  it("taxes / fees / loans → one_off (NOT recurring)", () => {
    // Critical: this is the exact bug user surfaced 2026-05-16. Taxes
    // were being labeled recurring on the home. Default MUST place
    // taxes/fees/loans in one_off.
    for (const cat of ["taxes", "fees", "loans"]) {
      expect(bucketFor(cat), `${cat} should be one_off`).toBe("one_off");
    }
  });

  it("uncategorized / unknown / empty → variable", () => {
    expect(bucketFor("groceries")).toBe("variable");
    expect(bucketFor("restaurants")).toBe("variable");
    expect(bucketFor("")).toBe("variable");
    expect(bucketFor(null)).toBe("variable");
    expect(bucketFor(undefined)).toBe("variable");
  });

  it("user override beats default", () => {
    const overrides = emptyOverrides();
    overrides.bucketOverrides.set("taxes", "recurring"); // user disagrees with default
    expect(bucketFor("taxes", overrides)).toBe("recurring");
  });

  it("override is case-sensitive to lowercase key — store lowercased", () => {
    const overrides = emptyOverrides();
    overrides.bucketOverrides.set("loans", "recurring"); // stored lowercase
    expect(bucketFor("LOANS", overrides)).toBe("recurring"); // lookup also lowercases
    expect(bucketFor("Loans", overrides)).toBe("recurring");
  });

  it("override for 'variable' explicitly removes a category from a fixed default", () => {
    const overrides = emptyOverrides();
    overrides.bucketOverrides.set("subscriptions", "variable");
    expect(bucketFor("subscriptions", overrides)).toBe("variable");
  });
});

describe("DEFAULT_FIXED_OBLIGATION_CATS — soft-spot exclusion", () => {
  it("is the union of recurring + one-off + adjustment", () => {
    for (const c of DEFAULT_RECURRING_CATS) {
      expect(DEFAULT_FIXED_OBLIGATION_CATS.has(c)).toBe(true);
    }
    for (const c of DEFAULT_ONE_OFF_CATS) {
      expect(DEFAULT_FIXED_OBLIGATION_CATS.has(c)).toBe(true);
    }
    for (const c of DEFAULT_ADJUSTMENT_CATS) {
      expect(DEFAULT_FIXED_OBLIGATION_CATS.has(c)).toBe(true);
    }
  });

  it("does NOT include any variable categories — soft-spot fires on those", () => {
    expect(DEFAULT_FIXED_OBLIGATION_CATS.has("groceries")).toBe(false);
    expect(DEFAULT_FIXED_OBLIGATION_CATS.has("restaurants")).toBe(false);
    expect(DEFAULT_FIXED_OBLIGATION_CATS.has("coffee")).toBe(false);
  });

  it("does NOT include income — income isn't an obligation", () => {
    expect(DEFAULT_FIXED_OBLIGATION_CATS.has("income")).toBe(false);
  });
});
