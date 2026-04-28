/**
 * Drives BTHome — spec §4.1.
 *
 * Returns the daily brief: greeting, breathing room, paycheck copy, and
 * (when present) one subscription tile + one dream tile. Phase 2 swaps
 * the BT_DATA mock fallback in BTHome.tsx for this hook's payload when
 * `ready: true`.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useToday() {
  return useQuery({
    queryKey: ["/api/tilly/today"],
    queryFn: btApi.today,
    staleTime: 60_000, // 1 minute
  });
}
