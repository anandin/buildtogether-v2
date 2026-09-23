import { describe, expect, it } from "vitest";

import {
  composeBriefing,
  pickPrimaryAction,
  suggestHabitsFromSignals,
  type CoachBriefInput,
} from "./coach-brief";

const base: CoachBriefInput = {
  name: "Anand",
  dossierArc: null,
  spentThisWeek: 86,
  topCategory: "restaurants",
  liquid: 1200,
  pendingCount: 0,
  upcoming: [
    { kind: "bill", id: "s1", label: "Spotify", amount: 11.99, date: "2026-09-26" },
  ],
  habits: [],
};

describe("coach brief", () => {
  it("grounds the briefing in spend, the next bill, and a dossier sentence", () => {
    const text = composeBriefing({
      ...base,
      dossierArc: "Pay lands biweekly and Fridays get loose. Worth watching.",
    });
    expect(text).toContain("Pay lands biweekly");
    expect(text).toContain("86");
    expect(text).toContain("restaurants");
    expect(text).toContain("Spotify");
  });

  it("prefers clearing a pending pile over a habit nudge", () => {
    const action = pickPrimaryAction({ ...base, pendingCount: 6 });
    expect(action.route).toBe("pending");
    expect(action.title).toContain("6");
  });

  it("suggests a no-spend day when restaurants cluster", () => {
    const ideas = suggestHabitsFromSignals({
      restaurantDays: 5,
      subscriptionCount: 1,
      pendingCount: 0,
      surplus: 200,
      existingKinds: [],
    });
    expect(ideas.map((i) => i.kind)).toContain("no_spend_day");
    expect(ideas.map((i) => i.kind)).toContain("save_amount");
  });
});
