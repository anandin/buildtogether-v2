import { describe, expect, it } from "vitest";

import { computeHabitStats, weekStartIso } from "./habit-math";

describe("computeHabitStats", () => {
  it("counts a daily streak through today and keeps yesterday's run if today is open", () => {
    const throughToday = computeHabitStats({
      cadence: "daily",
      checkinDates: ["2026-09-20", "2026-09-21", "2026-09-22"],
      todayIso: "2026-09-22",
      createdIso: "2026-09-01",
    });
    expect(throughToday.currentStreak).toBe(3);
    expect(throughToday.checkedInPeriod).toBe(true);
    expect(throughToday.due).toBe(false);

    const openToday = computeHabitStats({
      cadence: "daily",
      checkinDates: ["2026-09-20", "2026-09-21"],
      todayIso: "2026-09-22",
      createdIso: "2026-09-01",
    });
    expect(openToday.currentStreak).toBe(2);
    expect(openToday.due).toBe(true);
  });

  it("breaks a daily streak when yesterday was missed", () => {
    const stats = computeHabitStats({
      cadence: "daily",
      checkinDates: ["2026-09-18", "2026-09-19"],
      todayIso: "2026-09-22",
      createdIso: "2026-09-01",
    });
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(2);
  });

  it("rates a weekly habit across the trailing four weeks", () => {
    expect(weekStartIso("2026-09-23")).toBe("2026-09-21"); // Wednesday → Monday
    const stats = computeHabitStats({
      cadence: "weekly",
      checkinDates: ["2026-09-08", "2026-09-22"],
      todayIso: "2026-09-23",
      createdIso: "2026-08-01",
    });
    expect(stats.checkedInPeriod).toBe(true);
    expect(stats.currentStreak).toBe(1);
    expect(stats.weeklyCompletionRate).toBeGreaterThan(0);
    expect(stats.weeklyCompletionRate).toBeLessThanOrEqual(1);
  });
});
