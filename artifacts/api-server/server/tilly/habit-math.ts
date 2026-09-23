/**
 * Pure habit math — streaks and weekly completion. Dates are YYYY-MM-DD
 * already in the user's local zone; no timezone conversion happens here.
 */

export type HabitCadence = "daily" | "weekly";

export type HabitStats = {
  currentStreak: number;
  bestStreak: number;
  /** Daily: checked today. Weekly: checked sometime this ISO week. */
  checkedInPeriod: boolean;
  due: boolean;
  /** 0–1. Daily uses the trailing 7 days (or fewer if the habit is new).
   * Weekly uses the trailing 4 weeks. */
  weeklyCompletionRate: number;
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6. */
function weekdayMon0(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function weekStartIso(iso: string): string {
  return addDays(iso, -weekdayMon0(iso));
}

function uniqueSorted(dates: string[]): string[] {
  return Array.from(new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
}

function dailyBest(dates: string[]): number {
  if (dates.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1]!;
    const cur = dates[i]!;
    if (addDays(prev, 1) === cur) {
      run += 1;
      if (run > best) best = run;
    } else if (cur !== prev) {
      run = 1;
    }
  }
  return best;
}

function dailyCurrent(set: Set<string>, todayIso: string): number {
  // A miss today doesn't zero the streak until the day is over from the
  // user's point of view — we count the run ending yesterday when today
  // isn't checked yet. A miss yesterday breaks it.
  let cursor = set.has(todayIso) ? todayIso : addDays(todayIso, -1);
  if (!set.has(cursor)) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

function weeklyKeys(dates: string[]): string[] {
  return uniqueSorted(dates.map(weekStartIso));
}

export function computeHabitStats(input: {
  cadence: HabitCadence;
  /** Completed check-in dates. */
  checkinDates: string[];
  todayIso: string;
  /** Habit created date (YYYY-MM-DD). Bounds the completion denominator. */
  createdIso: string;
}): HabitStats {
  const dates = uniqueSorted(input.checkinDates);
  const set = new Set(dates);

  if (input.cadence === "weekly") {
    const weeks = weeklyKeys(dates);
    const weekSet = new Set(weeks);
    const thisWeek = weekStartIso(input.todayIso);
    const checkedInPeriod = weekSet.has(thisWeek);
    let cursor = checkedInPeriod ? thisWeek : addDays(thisWeek, -7);
    let current = 0;
    if (weekSet.has(cursor)) {
      while (weekSet.has(cursor)) {
        current += 1;
        cursor = addDays(cursor, -7);
      }
    }
    let best = 0;
    let run = 0;
    const sortedWeeks = weeks;
    for (let i = 0; i < sortedWeeks.length; i++) {
      if (i === 0 || addDays(sortedWeeks[i - 1]!, 7) === sortedWeeks[i]) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > best) best = run;
    }
    const createdWeek = weekStartIso(input.createdIso);
    let window = 0;
    let hits = 0;
    for (let i = 0; i < 4; i++) {
      const w = addDays(thisWeek, -7 * i);
      if (w < createdWeek) break;
      window += 1;
      if (weekSet.has(w)) hits += 1;
    }
    return {
      currentStreak: current,
      bestStreak: best,
      checkedInPeriod,
      due: !checkedInPeriod,
      weeklyCompletionRate: window === 0 ? 0 : hits / window,
    };
  }

  const checkedInPeriod = set.has(input.todayIso);
  const created = input.createdIso <= input.todayIso ? input.createdIso : input.todayIso;
  let window = 0;
  let hits = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(input.todayIso, -i);
    if (day < created) break;
    window += 1;
    if (set.has(day)) hits += 1;
  }
  return {
    currentStreak: dailyCurrent(set, input.todayIso),
    bestStreak: dailyBest(dates),
    checkedInPeriod,
    due: !checkedInPeriod,
    weeklyCompletionRate: window === 0 ? 0 : hits / window,
  };
}
