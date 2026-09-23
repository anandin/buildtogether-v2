import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";
import type { HabitSuggestion } from "../api/types";

export function useHabits() {
  return useQuery({
    queryKey: ["/api/habits"],
    queryFn: btApi.habits,
    staleTime: 30_000,
  });
}

function useInvalidateHabits() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["/api/habits"] });
    qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
  };
}

export function useCreateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: btApi.createHabit,
    onSuccess: invalidate,
  });
}

export function useCheckInHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (id: string) => btApi.checkInHabit(id, { completed: true }),
    onSuccess: invalidate,
  });
}

export function useArchiveHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (id: string) => btApi.archiveHabit(id),
    onSuccess: invalidate,
  });
}

export function useAcceptHabitSuggestion() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (suggestion: HabitSuggestion) => btApi.acceptHabitSuggestion(suggestion),
    onSuccess: invalidate,
  });
}
