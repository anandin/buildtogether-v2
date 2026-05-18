import { describe, expect, it } from "vitest";

import { TOOL_NAMES, isKnownToolName } from "./registry";

describe("TOOL_NAMES registry", () => {
  it("has no duplicate tool names (case-sensitive)", () => {
    const set = new Set(TOOL_NAMES);
    expect(set.size).toBe(TOOL_NAMES.length);
  });

  it("includes the core mutation tools the agent expects", () => {
    // If any of these get accidentally removed during a refactor the
    // chat handler will silently lose abilities. Lock them in.
    const required = [
      "createDream",
      "markPaymentToOwnCard",
      "hideCategoryFromSpend",
      "pinToHome",
      "setOnboardingField",
      "setCategoryInclusion",
      "setMerchantCategory",
      "renameMerchant",
      "markIncomeAsTransfer",
      "setCategoryBucket",
      "flagAsIncome",
      "setMerchantCadence",
      "dismissAsNotIncome",
    ];
    for (const t of required) {
      expect(TOOL_NAMES, `tool "${t}" missing from registry`).toContain(t);
    }
  });

  it("includes the inverse / undo tools needed for reversibility", () => {
    const inverses = [
      "unhideCategory",
      "removePaymentToOwnCardAlias",
      "unpinFromHome",
      "unsetOnboardingField",
      "deleteDream",
    ];
    for (const t of inverses) {
      expect(TOOL_NAMES, `inverse tool "${t}" missing`).toContain(t);
    }
  });
});

describe("isKnownToolName", () => {
  it("accepts every name in TOOL_NAMES", () => {
    for (const t of TOOL_NAMES) {
      expect(isKnownToolName(t)).toBe(true);
    }
  });

  it("rejects fabricated names (Tilly can't invent new tools)", () => {
    expect(isKnownToolName("fakeToolName")).toBe(false);
    expect(isKnownToolName("createDream2")).toBe(false);
    expect(isKnownToolName("")).toBe(false);
    expect(isKnownToolName("CREATEDREAM")).toBe(false); // case-sensitive on purpose
  });
});
