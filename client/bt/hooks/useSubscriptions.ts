/**
 * Drives BTHome subscription tile + a future subscription-review modal.
 * Spec §4.1, §5.7.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useSubscriptions() {
  return useQuery({
    queryKey: ["/api/subscriptions"],
    queryFn: btApi.subscriptions,
    staleTime: 5 * 60_000,
  });
}

export function usePauseSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.pauseSubscription,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      qc.invalidateQueries({ queryKey: ["/api/protections"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
    },
  });
}
