/**
 * Manual expense capture — for users without Plaid (or for cash purchases).
 *   - useExpenses() reads the recent list (also feeds the spend pattern engine).
 *   - useCreateExpense(), useVoiceExpense(), usePhotoExpense() are the three
 *     entry flows behind the Spend FAB.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

export function useExpenses() {
  return useQuery({
    queryKey: ["/api/expenses"],
    queryFn: () => btApi.expenses(30),
    staleTime: 30_000,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["/api/expenses"] });
  qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
  qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.createExpense,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useVoiceExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.voiceExpense,
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePhotoExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: btApi.photoExpense,
    onSuccess: () => invalidateAll(qc),
  });
}
