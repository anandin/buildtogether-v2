/**
 * Drives BTCredit "Tilly protected you · 24h" card and ambient Home tiles.
 * Spec §5.7 protective surface.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useProtections() {
  return useQuery({
    queryKey: ["/api/protections"],
    queryFn: btApi.protections,
    staleTime: 5 * 60_000,
  });
}

export function useRecentProtections() {
  return useQuery({
    queryKey: ["/api/protections/recent"],
    queryFn: btApi.protectionsRecent,
    staleTime: 60_000,
  });
}

export function useDismissProtection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.dismissProtection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/protections"] }),
  });
}

export function useActProtection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.actProtection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/protections"] });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions"] });
    },
  });
}
