/**
 * Drives BTSpend — spec §4.3.
 *
 * Returns paycheck banner copy, week pattern headline, day-bars, emotional
 * categories with soft-spot tags, and today's mini-ledger.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useSpend() {
  return useQuery({
    queryKey: ["/api/tilly/spend-pattern"],
    queryFn: btApi.spendPattern,
    staleTime: 5 * 60_000,
  });
}
