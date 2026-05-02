/**
 * Drives BTCredit — spec §4.4.
 *
 * Returns utilization (the one number that matters), score (when available
 * — Phase 4 derives from Plaid liabilities per D3), levers, and the
 * "Tilly protected you · 24h" line items.
 */
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useCredit() {
  return useQuery({
    queryKey: ["/api/tilly/credit-snapshot"],
    queryFn: btApi.creditSnapshot,
    staleTime: 5 * 60_000,
  });
}
