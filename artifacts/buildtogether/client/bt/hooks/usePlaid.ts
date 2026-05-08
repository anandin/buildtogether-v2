/**
 * React Query hooks around the Plaid endpoints.
 *
 * - usePlaidStatus  — is Plaid configured for this deployment?
 * - usePlaidItems   — list of connected institutions for the household
 * - usePlaidPending — transactions waiting for the user to accept/ignore
 * - usePlaidSync    — kick off an incremental transaction sync
 * - usePlaidAccept / usePlaidIgnore — inbox actions
 * - usePlaidDisconnect — revoke a bank with Plaid + tombstone the local item
 *
 * All write hooks invalidate the relevant queries plus the manual-expense
 * caches on the chance an accepted Plaid transaction landed as an expense.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";
import { apiRequestRaw } from "@/lib/query-client";
import { useUser } from "./useUser";
import type { PlaidItem, PlaidPendingTransaction, PendingGroup } from "../api/types";

const QK = {
  status: ["/api/plaid/status"] as const,
  items: (couple: string) => ["/api/plaid/items", couple] as const,
  pending: (couple: string) => ["/api/plaid/pending", couple] as const,
  pendingGrouped: (couple: string) =>
    ["/api/plaid/pending-grouped", couple] as const,
};

export function usePlaidStatus() {
  return useQuery({
    queryKey: QK.status,
    queryFn: btApi.plaidStatus,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch helper that skips the global passkey gate. Returns an empty
 * array instead of popping the Face ID modal when the server says 403
 * PASSKEY_REQUIRED / PASSKEY_STALE. Callers that are just showing a
 * badge count or a list preview shouldn't force a biometric check.
 */
async function plaidGetSilent<T>(route: string, fallback: T): Promise<T> {
  const res = await apiRequestRaw("GET", route, undefined, {
    passkeyGuard: false,
  });
  if (!res.ok) {
    if (res.status === 403) return fallback;
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function usePlaidItems(opts?: { silent?: boolean }) {
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  const silent = opts?.silent ?? false;
  return useQuery({
    queryKey: couple ? QK.items(couple) : ["/api/plaid/items", "anon"],
    queryFn: silent
      ? () => plaidGetSilent<PlaidItem[]>(`/api/plaid/items/${couple}`, [])
      : () => btApi.plaidItems(couple as string),
    enabled: !!couple,
    staleTime: 30_000,
  });
}

export function usePlaidPending(opts?: { silent?: boolean }) {
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  const silent = opts?.silent ?? false;
  return useQuery({
    queryKey: couple ? QK.pending(couple) : ["/api/plaid/pending", "anon"],
    queryFn: silent
      ? () =>
          plaidGetSilent<PlaidPendingTransaction[]>(
            `/api/plaid/pending/${couple}`,
            [],
          )
      : () => btApi.plaidPending(couple as string),
    enabled: !!couple,
    staleTime: 30_000,
  });
}

export function invalidatePlaid(
  qc: ReturnType<typeof useQueryClient>,
  couple: string | null,
) {
  if (couple) {
    qc.invalidateQueries({ queryKey: QK.items(couple) });
    qc.invalidateQueries({ queryKey: QK.pending(couple) });
    qc.invalidateQueries({ queryKey: QK.pendingGrouped(couple) });
  }
  // Accepted Plaid transactions become expenses, which feeds Spend & Today.
  qc.invalidateQueries({ queryKey: ["/api/expenses"] });
  qc.invalidateQueries({ queryKey: ["/api/tilly/spend-pattern"] });
  qc.invalidateQueries({ queryKey: ["/api/tilly/today"] });
  // Sync may have generated new questions.
  qc.invalidateQueries({ queryKey: ["/api/tilly/questions"] });
}

/** Task #23: pending list grouped by merchant signature (for bulk accept). */
export function usePlaidPendingGrouped(opts?: { silent?: boolean }) {
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useQuery({
    queryKey: couple ? QK.pendingGrouped(couple) : ["/api/plaid/pending-grouped", "anon"],
    queryFn: () => btApi.plaidPendingGrouped(couple as string),
    enabled: !!couple,
    staleTime: 30_000,
  });
}

export function usePlaidPendingGroupAccept() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useMutation({
    mutationFn: (input: {
      signature: string;
      category?: string | null;
      tags?: string[] | null;
      note?: string | null;
      applyToFuture?: boolean;
    }) => {
      requireCouple(couple);
      return btApi.plaidPendingGroupAccept({ ...input, coupleId: couple as string });
    },
    onSuccess: () => invalidatePlaid(qc, couple),
  });
}

/**
 * Hook callers like BankConnectionsScreen drive PlaidConnectButton via its
 * `onConnected` callback. Expose a thin helper so the call site doesn't
 * need to thread the queryClient + householdId itself.
 */
export function useInvalidatePlaid() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return () => invalidatePlaid(qc, couple);
}

/** Throws a clear, user-readable error if the user isn't bound to a household. */
function requireCouple(couple: string | null): string {
  if (!couple) {
    throw new Error(
      "We're still finishing setting up your account. Try again in a moment.",
    );
  }
  return couple;
}

export function usePlaidSync() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useMutation({
    mutationFn: () => btApi.plaidSync(requireCouple(couple)),
    onSuccess: () => invalidatePlaid(qc, couple),
  });
}

export function usePlaidAccept() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useMutation({
    mutationFn: (input: string | { txnId: string; note?: string | null; tags?: string[] | null }) => {
      requireCouple(couple);
      if (typeof input === "string") return btApi.plaidAccept(input);
      const { txnId, note, tags } = input;
      return btApi.plaidAccept(txnId, { note: note ?? null, tags: tags ?? null });
    },
    onSuccess: () => invalidatePlaid(qc, couple),
  });
}

export function usePlaidIgnore() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useMutation({
    mutationFn: (txnId: string) => {
      requireCouple(couple);
      return btApi.plaidIgnore(txnId);
    },
    onSuccess: () => invalidatePlaid(qc, couple),
  });
}

export function usePlaidDisconnect() {
  const qc = useQueryClient();
  const { user } = useUser();
  const couple = user?.householdId ?? null;
  return useMutation({
    mutationFn: (itemId: string) => {
      requireCouple(couple);
      return btApi.plaidDisconnect(itemId);
    },
    onSuccess: () => invalidatePlaid(qc, couple),
  });
}
