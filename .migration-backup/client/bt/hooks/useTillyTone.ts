/**
 * useTillyTone — server-side tone preference (companion to BTContext).
 *
 * BTContext.setTone updates the local AsyncStorage cache for instant UI
 * feedback. This hook syncs the change to the server (`tilly_tone_pref`
 * table) so subsequent Claude calls use the right tone modifier and
 * subsequent sessions on other devices pick up the same preference.
 *
 * Usage from BTProfile tone tuner: call BTContext.setTone() AND
 * mutateTone({tone}) — local state flips immediately, server state catches up.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";
import type { BTToneKey } from "../tones";

export function useTillyTone() {
  return useQuery({
    queryKey: ["/api/tilly/tone"],
    queryFn: btApi.getTone,
    staleTime: Infinity,
  });
}

export function useSetTillyTone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tone: BTToneKey) => btApi.setTone(tone),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tilly/tone"] }),
  });
}
