/**
 * Drives BTSpend — spec §4.3.
 *
 * Range parameter (SS9) — `week` keeps existing behavior (7 day-bars,
 * soft-spot detection). `month` returns 4 weekly bars over the last
 * 28 days; `year` returns 12 monthly bars over the last 365 days.
 * Categories re-rank per range; soft-spot detection only fires on
 * week. Selection persists via user_preferences.spend.range so the
 * tab opens to the user's last choice.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export type SpendRange = "week" | "month" | "year";

export function useSpend(range: SpendRange = "week") {
  return useQuery({
    queryKey: ["/api/tilly/spend-pattern", range],
    queryFn: () => btApi.spendPattern(range),
    staleTime: 5 * 60_000,
  });
}
