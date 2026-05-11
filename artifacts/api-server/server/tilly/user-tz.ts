/**
 * User timezone resolution.
 *
 * Vercel runs server functions in UTC. The user lives in Toronto.
 * Sunday 9pm Toronto = Monday 1am UTC — so any "this week" / "today"
 * math done with raw `new Date()` on the server crosses the week
 * boundary 4-5 hours early and produces empty-state bugs (spend page
 * shows $0, today greeting flips to "tomorrow's brief", etc.).
 *
 * This module owns the mapping from user → IANA timezone string + the
 * arithmetic helpers (weekStart, todayIso, dayOfWeekIndex) that respect
 * that zone.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../../shared/schema";

/** Default for Canadian-beachhead users when no city is set. */
const DEFAULT_TZ = "America/Toronto";

/** Lookup table for beachhead + common Canadian / US cities. Extend as
 * users beyond Laurier hit prod. Lowercased lookup. */
const CITY_TO_TZ: Record<string, string> = {
  // Ontario (primary)
  toronto: "America/Toronto",
  waterloo: "America/Toronto",
  kitchener: "America/Toronto",
  cambridge: "America/Toronto",
  guelph: "America/Toronto",
  hamilton: "America/Toronto",
  mississauga: "America/Toronto",
  brampton: "America/Toronto",
  burlington: "America/Toronto",
  oakville: "America/Toronto",
  ottawa: "America/Toronto",
  london: "America/Toronto",
  // Quebec
  montreal: "America/Toronto",
  "québec city": "America/Toronto",
  "quebec city": "America/Toronto",
  // Atlantic
  halifax: "America/Halifax",
  "st johns": "America/St_Johns",
  "st. john's": "America/St_Johns",
  // Prairies
  winnipeg: "America/Winnipeg",
  regina: "America/Regina",
  saskatoon: "America/Regina",
  calgary: "America/Edmonton",
  edmonton: "America/Edmonton",
  // West coast
  vancouver: "America/Vancouver",
  victoria: "America/Vancouver",
  // Common US for international students
  "new york": "America/New_York",
  boston: "America/New_York",
  chicago: "America/Chicago",
  "los angeles": "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  seattle: "America/Los_Angeles",
};

export function cityToTimezone(city: string | null | undefined): string {
  if (!city) return DEFAULT_TZ;
  const key = city.trim().toLowerCase().replace(/[,].*$/, "").trim();
  return CITY_TO_TZ[key] ?? DEFAULT_TZ;
}

/**
 * Resolve the IANA timezone for a user. Reads `users.city` (set during
 * onboarding or via Tilly setOnboardingField tool). Defaults to
 * America/Toronto since the beachhead is Laurier.
 *
 * Cheap (single query, ~3ms). Callers that care about latency can pass
 * an already-loaded user record into the underlying helpers directly.
 */
export async function getUserTimezone(userId: string | null): Promise<string> {
  if (!userId) return DEFAULT_TZ;
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { city: true },
  });
  return cityToTimezone(row?.city ?? null);
}

/**
 * Return a YYYY-MM-DD string for the given moment AS IT APPEARS in the
 * target timezone. Used to ask "what's today's date in the user's
 * world?" — independent of the server's UTC clock.
 *
 * Implemented via Intl.DateTimeFormat to avoid adding date-fns-tz as a
 * dep. Works in node 18+.
 */
export function localDateString(now: Date, tz: string): string {
  // en-CA format is YYYY-MM-DD which is exactly what plaid_transactions.date uses.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Returns the YYYY-MM-DD string for the Monday that opens "this week"
 * in the user's timezone. Used as the lower bound for the Spend
 * page's this-week filter.
 */
export function localWeekStartIso(now: Date, tz: string): string {
  const todayIso = localDateString(now, tz);
  // Parse the local date components back into a Date at midnight UTC —
  // safe because we only ever do day-arithmetic from here and the
  // result is re-formatted via localDateString.
  const [y, m, d] = todayIso.split("-").map((s) => parseInt(s, 10));
  const todayUTC = new Date(Date.UTC(y, m - 1, d));
  // Day-of-week in the user's TZ. Compute via the same Intl trick to
  // avoid getDay()'s UTC bias.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  const weekdayIdx: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  const idx = weekdayIdx[weekday] ?? 0;
  todayUTC.setUTCDate(todayUTC.getUTCDate() - idx);
  return `${todayUTC.getUTCFullYear()}-${String(todayUTC.getUTCMonth() + 1).padStart(2, "0")}-${String(todayUTC.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Monday=0 … Sunday=6 index for "today" in the user's timezone.
 * Spend-pattern uses this to mark the current-day column in the bar
 * chart. Same Intl trick to avoid UTC bias.
 */
export function localDayOfWeekIndex(now: Date, tz: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return map[weekday] ?? 0;
}

/**
 * YYYY-MM-DD string N days before today (in the user's TZ). Useful for
 * "last 7 days" rolling windows.
 */
export function localDaysAgoIso(now: Date, tz: string, daysAgo: number): string {
  const todayIso = localDateString(now, tz);
  const [y, m, d] = todayIso.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - daysAgo);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
