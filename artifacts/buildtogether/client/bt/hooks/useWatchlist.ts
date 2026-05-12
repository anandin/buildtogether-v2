/**
 * Watchlist hook — Sprint A habit loop.
 *
 * Reads /api/tilly/watchlist (active items), exposes add/update/forget
 * mutations that invalidate the same query so the Today tile count +
 * any open drill-in refetch immediately.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useWatchlist() {
  const q = useQuery({
    queryKey: ["/api/tilly/watchlist"],
    queryFn: btApi.watchlist,
    staleTime: 30_000,
  });
  return {
    items: q.data?.items ?? [],
    isLoading: q.isLoading,
  };
}

export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; estimatedPrice?: number }) =>
      btApi.watchlistAdd(input.name, input.estimatedPrice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/watchlist"] });
    },
  });
}

export function useUpdateWatchlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      status?: "active" | "bought" | "dropped";
      estimatedPrice?: number;
      name?: string;
    }) => {
      const { id, ...patch } = input;
      return btApi.watchlistUpdate(id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/watchlist"] });
    },
  });
}
