/**
 * Drives BTProfile timeline + the memory inspector behind the Tilly
 * chat "memory" pill. Spec §4.6 + §5.4 (trust contract).
 *
 * `forget` archives a single memory. `exportMarkdown` returns a markdown
 * bundle the user can save anywhere. Both are user-controlled — never a
 * background prune.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useMemory() {
  return useQuery({
    queryKey: ["/api/tilly/memory"],
    queryFn: btApi.memory,
    staleTime: 60_000,
  });
}

export function useForgetMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.forgetMemory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tilly/memory"] }),
  });
}

export function useExportMemory() {
  return useMutation({ mutationFn: btApi.exportMemory });
}
