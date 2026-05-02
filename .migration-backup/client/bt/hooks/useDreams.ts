/**
 * Drives BTDreams — spec §4.5.
 *
 * List + create + contribute. Phase 3 wires Plaid Transfer auto-debit per
 * D4 so "+$40 moves Friday" is an actual transfer, not just copy.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useDreams() {
  return useQuery({
    queryKey: ["/api/dreams"],
    queryFn: btApi.dreams,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.createDream,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dreams"] }),
  });
}

export function useContributeDream() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      btApi.contributeDream(id, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/dreams"] }),
  });
}
