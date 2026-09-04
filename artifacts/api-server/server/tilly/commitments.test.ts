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
