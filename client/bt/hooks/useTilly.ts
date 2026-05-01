/**
 * Drives BTGuardian — spec §4.2.
 *
 * Pairs `chatHistory` (loaded once) with a `send` mutation that appends a
 * user turn and the Tilly reply. Phase 2 streams typing state from the
 * backend; Phase 1 returns 501 stubs.
 *
 * S9 — when there's a scout-kind message in flight (status queued/running),
 * the history query refetches every 2.5s so the bubble transitions from
 * "scouting…" to the result card without the user touching anything.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { btApi } from "../api/client";
import type { TillyMessage } from "../api/types";

/** Minimal client-side shape used for the inline chip. */
type ConfirmedReminder = { label: string; fireAt: string };

export function useTilly() {
  const qc = useQueryClient();
  // When the chat endpoint creates a reminder via the Haiku classifier,
  // it returns the reminder info in the response. We keep that bound to
  // the Tilly reply's id so BTGuardian can render an inline chip on
  // exactly that bubble. Transient — survives until the next send or
  // a hard reload (the source of truth is the Today/You tabs).
  const [confirmedReminders, setConfirmedReminders] = useState<
    Record<string, ConfirmedReminder>
  >({});

  const history = useQuery({
    queryKey: ["/api/tilly/chat/history"],
    queryFn: btApi.chatHistory,
    staleTime: Infinity,
    // Pulse every 2.5s ONLY while a scout is mid-flight; otherwise the
    // chat is silent (matches old behavior). React Query passes the
    // current data; we look for any scout still queued/running.
    refetchInterval: (q) => {
      const data = q.state.data as { messages?: TillyMessage[] } | undefined;
      const inFlight = (data?.messages ?? []).some(
        (m) =>
          m.role === "tilly" &&
          (m.kind === "scout" || m.kind === "wait") &&
          (m.status === "queued" || m.status === "running"),
      );
      return inFlight ? 2500 : false;
    },
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
      // The server may have classified Tilly's reply as a follow-up
      // promise and inserted a tilly_reminders row. Refetch the lists
      // that surface them — Today's Up Next card + Reminders screens
      // — so the new reminder appears without a manual reload.
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders"] });
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders/today"] });
      // Bind the inline confirmation chip to this specific reply.
      if (data.createdReminder && data.reply?.id) {
        setConfirmedReminders((prev) => ({
          ...prev,
          [data.reply.id]: {
            label: data.createdReminder!.label,
            fireAt: data.createdReminder!.fireAt,
          },
        }));
      }
    },
  });

  const scout = useMutation({
    mutationFn: (body: { query: string; location?: string | null; sourceMessageId?: string }) =>
      btApi.chatScout(body),
    onSuccess: () => {
      // Refresh chat history so the new scout-kind bubble appears.
      qc.invalidateQueries({ queryKey: ["/api/tilly/chat/history"] });
    },
  });

  const wait = useMutation({
    mutationFn: (body: { query: string; location?: string | null; sourceMessageId?: string }) =>
      btApi.chatWait(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/chat/history"] });
    },
  });

  return {
    messages: history.data?.messages ?? [],
    isLoading: history.isLoading,
    isThinking: send.isPending,
    send: (message: string) => send.mutate(message),
    scout: (body: { query: string; location?: string | null; sourceMessageId?: string }) =>
      scout.mutate(body),
    isScouting: scout.isPending,
    askWait: (body: { query: string; location?: string | null; sourceMessageId?: string }) =>
      wait.mutate(body),
    isAskingWait: wait.isPending,
    confirmedReminders,
  };
}
