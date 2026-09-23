import { describe, expect, it } from "vitest";

import { shouldAutoAcceptByAI } from "./plaid";

describe("shouldAutoAcceptByAI", () => {
  it("files a confident grocery under the cap", () => {
    expect(
      shouldAutoAcceptByAI(
        0.86,
        { amount: 42, personal_finance_category: { primary: "FOOD_AND_DRINK" } },
        "restaurants",
      ),
    ).toBe(true);
  });

  it("keeps loans and transfers as questions", () => {
    expect(
      shouldAutoAcceptByAI(
        0.97,
        { amount: 80, personal_finance_category: { primary: "LOAN_PAYMENTS" } },
        "loans",
      ),
    ).toBe(false);
    expect(
      shouldAutoAcceptByAI(0.95, { amount: 20, personal_finance_category: { primary: "TRANSFER_OUT" } }, "transfers"),
    ).toBe(false);
  });

  it("does not auto-file a large charge just because the model is sure", () => {
    expect(
      shouldAutoAcceptByAI(
        0.99,
        { amount: 900, personal_finance_category: { primary: "GENERAL_MERCHANDISE" } },
        "shopping",
      ),
    ).toBe(false);
  });
});
