import { describe, expect, it } from "vitest";

import {
  findDuplicateCharges,
  findFeeLeakage,
  findLeakage,
  findRepeatConvenience,
  harvestAllowedFigures,
  validateNarrative,
  type WeekTx,
} from "./week-narrator";

// The narrator's contract: the life-spend is affirmed, the leakage is
// checkable, and every number in the narrative exists in the data. The
// LLM phrases; these deterministic parts decide what may be said.

const kidsWeek: WeekTx[] = [
  { merchant: "Canada's Wonderland", category: "entertainment", amount: 214, date: "2026-08-08" },
  { merchant: "Toys R Us", category: "shopping", amount: 86, date: "2026-08-08" },
  { merchant: "Dairy Queen", category: "dining", amount: 32, date: "2026-08-08" },
  { merchant: "DoorDash", category: "dining", amount: 48, date: "2026-08-07" },
  { merchant: "DoorDash", category: "dining", amount: 39, date: "2026-08-05" },
  { merchant: "DoorDash", category: "dining", amount: 44, date: "2026-08-04" },
  { merchant: "Indigo Kids", category: "shopping", amount: 41, date: "2026-08-06" },
  { merchant: "NSF Fee", category: "fees", amount: 48, date: "2026-08-05" },
  { merchant: "Crave", category: "subscriptions", amount: 22, date: "2026-08-04" },
  { merchant: "Crave", category: "subscriptions", amount: 22, date: "2026-08-04" },
];

describe("leakage finders — checkable, never vibes", () => {
  it("finds the fee row", () => {
    const fee = findFeeLeakage(kidsWeek);
    expect(fee).toEqual({ kind: "fees", label: "a NSF Fee charge", amount: 48 });
  });

  it("ignores sub-$5 fee noise", () => {
    expect(
      findFeeLeakage([{ merchant: "ATM Fee", category: "fees", amount: 3, date: "2026-08-05" }]),
    ).toBeNull();
  });

  it("finds the 3× convenience pattern with a weekly total", () => {
    const rep = findRepeatConvenience(kidsWeek);
    expect(rep).toEqual({
      kind: "repeat_convenience",
      label: "3× DoorDash",
      amount: 131,
    });
  });

  it("two hits are not a pattern", () => {
    const txs = kidsWeek.filter((t) => t.merchant !== "DoorDash");
    expect(findRepeatConvenience(txs)).toBeNull();
  });

  it("finds the same-day same-amount duplicate — most actionable, listed first", () => {
    const dup = findDuplicateCharges(kidsWeek);
    expect(dup).toEqual({
      kind: "duplicate_charge",
      label: "Crave charged twice on 2026-08-04",
      amount: 22,
    });
    expect(findLeakage(kidsWeek)[0].kind).toBe("duplicate_charge");
  });

  it("different days are not a duplicate", () => {
    const txs: WeekTx[] = [
      { merchant: "Crave", category: "subscriptions", amount: 22, date: "2026-08-04" },
      { merchant: "Crave", category: "subscriptions", amount: 22, date: "2026-08-11" },
    ];
    expect(findDuplicateCharges(txs)).toBeNull();
  });
});

describe("validateNarrative — what may reach the user", () => {
  const allowed = harvestAllowedFigures({
    txs: kidsWeek,
    leakage: findLeakage(kidsWeek),
    thisWeekTotal: 596,
    priorWeekTotal: 340,
  });

  it("accepts the target copy — affirmation + checkable leakage", () => {
    const text =
      "A kids-and-outings week — Wonderland, Dairy Queen, the works. Those memories were worth every bit. Two things worth a look: Crave charged you twice on the 4th ($22 — likely refundable), and three DoorDash runs added up to $131.";
    expect(validateNarrative(text, allowed, false)).toEqual({ ok: true });
  });

  it("rejects judgment vocabulary about the life-spend", () => {
    for (const bad of [
      "You overspent on the kids this week.",
      "A fun week, but you splurged at Wonderland.",
      "That was too much for one week.",
      "Thursdays are still your soft spot.",
    ]) {
      expect(validateNarrative(bad, allowed, false).ok).toBe(false);
    }
  });

  it("rejects the deficit opener", () => {
    expect(validateNarrative("You spent $596 this week on the kids.", allowed, false).ok).toBe(
      false,
    );
  });

  it("rejects fabricated figures — the $173k lesson applies here too", () => {
    const v = validateNarrative("Wonderland ran $500 this week.", allowed, false);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/fabricated figure/);
  });

  it("rejects surplus claims while income is unverified, allows them after", () => {
    const text = "Big week for the kids — and you still have plenty of room for it.";
    expect(validateNarrative(text, allowed, true).ok).toBe(false);
    // Same sentence minus the banned "still": surplus is fine once income is verified.
    const clean = "Big week for the kids — and there's plenty of room for it.";
    expect(validateNarrative(clean, allowed, false).ok).toBe(true);
    expect(validateNarrative(clean, allowed, true).ok).toBe(false);
  });

  it("allows sums of leakage items — 'about $70 across fees and the trial'", () => {
    // fee 48 + duplicate 22 = 70
    expect(validateNarrative("About $70 of it was pure friction.", allowed, false).ok).toBe(true);
  });
});
