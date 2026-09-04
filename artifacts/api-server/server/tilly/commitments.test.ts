import { describe, expect, it } from "vitest";

import { paydaysToTarget, planSweeps } from "./commitments";

// The outcome layer's one non-negotiable: a thin cycle SKIPS, it never
// cancels. Inertia works for the saver.

const base = {
  commitments: [
    { id: "c1", targetGoalId: "g1", amount: 250, floorAmount: null },
    { id: "c2", targetGoalId: "g2", amount: 100, floorAmount: null },
  ],
  trulyFree: 2645,
  alreadyExecuted: new Set<string>(),
  remainingByGoal: new Map([
    ["g1", 4000],
    ["g2", 900],
  ]),
};

describe("planSweeps", () => {
  it("executes every active sweep when there is room", () => {
    const plan = planSweeps(base);
    expect(plan.execute).toEqual([
      { commitmentId: "c1", goalId: "g1", amount: 250 },
      { commitmentId: "c2", goalId: "g2", amount: 100 },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("is idempotent per payday — an already-executed sweep is skipped, not doubled", () => {
    const plan = planSweeps({ ...base, alreadyExecuted: new Set(["c1"]) });
    expect(plan.execute.map((e) => e.commitmentId)).toEqual(["c2"]);
    expect(plan.skipped).toEqual([{ commitmentId: "c1", reason: "already_done" }]);
  });

  it("thin cycle: skips for lack of room and keeps the commitment intact", () => {
    const plan = planSweeps({ ...base, trulyFree: 80 });
    expect(plan.execute).toEqual([]);
    expect(plan.skipped.every((s) => s.reason === "no_room")).toBe(true);
  });

  it("consumes room in order so two sweeps never overdraw the floor together", () => {
    // Room for the first ($250) but not both ($350).
    const plan = planSweeps({ ...base, trulyFree: 300 });
    expect(plan.execute.map((e) => e.commitmentId)).toEqual(["c1"]);
    expect(plan.skipped).toEqual([{ commitmentId: "c2", reason: "no_room" }]);
  });

  it("honours a per-commitment floor", () => {
    const plan = planSweeps({
      ...base,
      trulyFree: 400,
      commitments: [{ id: "c1", targetGoalId: "g1", amount: 250, floorAmount: 200 }],
    });
    // 400 − 250 = 150 < floor 200 → skip.
    expect(plan.execute).toEqual([]);
    expect(plan.skipped[0].reason).toBe("no_room");
  });

  it("caps the sweep at what the goal still needs", () => {
    const plan = planSweeps({ ...base, remainingByGoal: new Map([["g1", 60], ["g2", 900]]) });
    expect(plan.execute[0]).toEqual({ commitmentId: "c1", goalId: "g1", amount: 60 });
  });

  it("skips a fully funded goal", () => {
    const plan = planSweeps({ ...base, remainingByGoal: new Map([["g1", 0], ["g2", 900]]) });
    expect(plan.skipped).toEqual([{ commitmentId: "c1", reason: "goal_funded" }]);
  });

  it("negative truly-free skips everything", () => {
    const plan = planSweeps({ ...base, trulyFree: -400 });
    expect(plan.execute).toEqual([]);
  });
});

describe("paydaysToTarget — the consequence delta", () => {
  it("rounds up", () => {
    expect(paydaysToTarget(4000, 250)).toBe(16);
    expect(paydaysToTarget(4001, 250)).toBe(17);
  });
  it("funded goals need zero paydays", () => {
    expect(paydaysToTarget(0, 250)).toBe(0);
  });
  it("no contribution means no arrival date, not infinity in the UI", () => {
    expect(paydaysToTarget(4000, 0)).toBeNull();
  });
});

// ── Escalation — Save More Tomorrow on detected paycheques (F4) ──────

import { planEscalation, ESCALATION_STEP } from "./commitments";

describe("planEscalation", () => {
  const rule = { rate: 0.25, ceiling: null, baselinePaycheck: 6745, consentedAt: "2026-08-06T00:00:00Z" };

  it("raises the sweep by a quarter of a pay raise, in $25 steps", () => {
    // +$400 → 25% = $100.
    const p = planEscalation({ rule, currentAmount: 250, trailingMedianPaycheck: 7145 });
    expect(p).toEqual({ newAmount: 350, raise: 100, paycheckDelta: 400 });
  });

  it("take-home never falls — the raise is always less than the pay increase", () => {
    for (const delta of [50, 137, 400, 2000]) {
      const p = planEscalation({ rule, currentAmount: 250, trailingMedianPaycheck: 6745 + delta });
      if (p) expect(p.raise).toBeLessThanOrEqual(delta);
    }
  });

  it("ignores noise below the minimum delta", () => {
    expect(planEscalation({ rule, currentAmount: 250, trailingMedianPaycheck: 6790 })).toBeNull();
  });

  it("ignores a raise too small to make one step", () => {
    // +$60 → 25% = $15 < $25.
    expect(planEscalation({ rule, currentAmount: 250, trailingMedianPaycheck: 6805 })).toBeNull();
  });

  it("never applies the same raise twice — measures from lastAppliedPaycheck", () => {
    const applied = { ...rule, lastAppliedPaycheck: 7145 };
    expect(planEscalation({ rule: applied, currentAmount: 350, trailingMedianPaycheck: 7145 })).toBeNull();
    // A further +$200 on top of that does count.
    expect(planEscalation({ rule: applied, currentAmount: 350, trailingMedianPaycheck: 7345 })?.raise).toBe(50);
  });

  it("respects the ceiling and reports only the raise actually applied", () => {
    const p = planEscalation({ rule: { ...rule, ceiling: 300 }, currentAmount: 250, trailingMedianPaycheck: 7145 });
    expect(p).toEqual({ newAmount: 300, raise: 50, paycheckDelta: 400 });
    expect(planEscalation({ rule: { ...rule, ceiling: 250 }, currentAmount: 250, trailingMedianPaycheck: 7145 })).toBeNull();
  });

  it("a paycheque DROP never lowers the sweep — that's the user's one-tap call, not the rule's", () => {
    expect(planEscalation({ rule, currentAmount: 250, trailingMedianPaycheck: 6000 })).toBeNull();
  });

  it("no rule, no escalation", () => {
    expect(planEscalation({ rule: null, currentAmount: 250, trailingMedianPaycheck: 9000 })).toBeNull();
    expect(planEscalation({ rule: { ...rule, rate: 0 }, currentAmount: 250, trailingMedianPaycheck: 9000 })).toBeNull();
  });

  it("step constant is what the copy promises", () => {
    expect(ESCALATION_STEP).toBe(25);
  });
});
