import { describe, expect, it } from "vitest";

import {
  TOOL_GROUPS,
  TOOL_NAMES,
  getToolDescription,
  getUngroupedTools,
  isKnownToolName,
} from "./registry";

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

describe("TOOL_GROUPS — namespacing for persona display", () => {
  it("every TOOL_NAMES entry appears in exactly one group OR is ungrouped (no dupes)", () => {
    const seen = new Map<string, number>();
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        seen.set(t, (seen.get(t) ?? 0) + 1);
      }
    }
    for (const [name, count] of seen) {
      expect(count, `tool "${name}" appears in ${count} groups (should be 1)`).toBe(1);
    }
  });

  it("references only valid TOOL_NAMES (no typos in group config)", () => {
    for (const g of TOOL_GROUPS) {
      for (const t of g.tools) {
        expect(isKnownToolName(t), `group "${g.label}" references unknown tool "${t}"`).toBe(true);
      }
    }
  });

  it("groups have a label + non-empty tool list", () => {
    for (const g of TOOL_GROUPS) {
      expect(g.label).toBeTruthy();
      expect(g.tools.length).toBeGreaterThan(0);
    }
  });

  it("warns (via getUngroupedTools) when a tool gets added without grouping", () => {
    // This test is a soft signal — when it starts returning items, the
    // dev added a tool but forgot to put it in TOOL_GROUPS. The
    // persona will still show ungrouped tools (under an "OTHER"
    // bucket) but the dev should fix the grouping.
    const ungrouped = getUngroupedTools();
    // We don't assert ungrouped.length === 0 because we deliberately
    // allow tools to land before being categorized. But we DO log so
    // the operator sees the drift:
    if (ungrouped.length > 0) {
      console.log("[test] tools awaiting TOOL_GROUPS assignment:", ungrouped);
    }
  });
});

describe("getToolDescription", () => {
  it("returns a description for every registered tool", () => {
    for (const name of TOOL_NAMES) {
      const desc = getToolDescription(name);
      expect(desc, `${name} missing description`).toBeTruthy();
      expect(typeof desc).toBe("string");
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
