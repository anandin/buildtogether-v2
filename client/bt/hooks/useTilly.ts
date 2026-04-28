/**
 * Drives BTGuardian — spec §4.2.
 *
 * Pairs `chatHistory` (loaded once) with a `send` mutation that appends a
 * user turn and the Tilly reply. Phase 2 streams typing state from the
 * backend; Phase 1 returns 501 stubs.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";
import type { TillyMessage } from "../api/types";

export function useTilly() {
  const qc = useQueryClient();

  const history = useQuery({
    queryKey: ["/api/tilly/chat/history"],
    queryFn: btApi.chatHistory,
    staleTime: Infinity,
  });

  const send = useMutation({
    mutationFn: (message: string) => btApi.sendChat(message),
    onMutate: async (message) => {
      // Optimistic: append the user turn immediately for that "feels alive" moment.
      const optimistic: TillyMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        kind: "text",
        body: message,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<{ messages: TillyMessage[] }>(
        ["/api/tilly/chat/history"],
        (prev) => ({ messages: [...(prev?.messages ?? []), optimistic] }),
      );
    },
    onSuccess: (data) => {
      qc.setQueryData<{ messages: TillyMessage[] }>(
        ["/api/tilly/chat/history"],
        (prev) => ({ messages: [...(prev?.messages ?? []), data.reply] }),
      );
    },
  });

  return {
    messages: history.data?.messages ?? [],
    isLoading: history.isLoading,
    isThinking: send.isPending,
    send: (message: string) => send.mutate(message),
  };
}
