/**
 * Task #23 — sync-time questions hooks.
 *
 * useTillyQuestions: list of OPEN questions (capped at 3 server-side).
 * useAnswerTillyQuestion / useDismissTillyQuestion: mutations.
 *
 * The questions also ride on /api/tilly/today (BTHome strip), so
 * answering invalidates BOTH caches to keep the strip honest.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

const QK_QUESTIONS = ["/api/tilly/questions"] as const;
const QK_TODAY = ["/api/tilly/today"] as const;

export function useTillyQuestions() {
  return useQuery({
    queryKey: QK_QUESTIONS,
    queryFn: btApi.tillyQuestions,
    staleTime: 30_000,
  });
}

export function useAnswerTillyQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      answer?: string;
      action?: "create_rule";
      category?: string | null;
      tags?: string[] | null;
      note?: string | null;
    }) => {
      const { id, ...body } = input;
      return btApi.tillyQuestionAnswer(id, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_QUESTIONS });
      qc.invalidateQueries({ queryKey: QK_TODAY });
    },
  });
}

export function useDismissTillyQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => btApi.tillyQuestionDismiss(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_QUESTIONS });
      qc.invalidateQueries({ queryKey: QK_TODAY });
    },
  });
}
