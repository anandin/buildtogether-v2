/**
 * App-foreground Plaid sync.
 *
 * Tilly only pulls fresh bank transactions on three triggers: initial
 * bank connect, explicit pull-to-refresh on Bank Connections, and the
 * Plaid webhook. Without this hook, simply re-opening the app between
 * pull-to-refreshes leaves the user staring at yesterday's ledger.
 *
 * Behaviour:
 *   - Fires `usePlaidSync` once on every transition from
 *     background/inactive → active.
 *   - Throttled to at most one sync per 60 seconds across the whole
 *     session, so rapidly switching apps doesn't pile up requests.
 *   - No-op when the user has no household yet (pre-onboarding).
 *   - The mutation itself routes through the shared passkey gate, so
 *     a stale Face ID surfaces the prompt as the user opens the app
 *     — the moment they're already present and expecting to interact.
 *     If they cancel, the request fails silently and the next
 *     foreground transition tries again.
 *   - Also runs once on mount so a cold open from a killed process
 *     (where AppState was already "active" before we registered) still
 *     triggers a sync.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePlaidSync } from "./usePlaid";
import { useUser } from "./useUser";

const MIN_SYNC_INTERVAL_MS = 60_000;

export function usePlaidForegroundSync() {
  const { user } = useUser();
  const sync = usePlaidSync();
  const lastSyncAt = useRef<number>(0);
  const previousState = useRef<AppStateStatus>(AppState.currentState);

  // Keep refs to the latest mutate fn + householdId so the AppState
  // listener doesn't capture stale values across re-renders.
  const mutateRef = useRef(sync.mutate);
  mutateRef.current = sync.mutate;
  const householdRef = useRef<string | null>(user?.householdId ?? null);
  householdRef.current = user?.householdId ?? null;

  useEffect(() => {
    const maybeSync = (reason: string) => {
      if (!householdRef.current) return;
      const now = Date.now();
      if (now - lastSyncAt.current < MIN_SYNC_INTERVAL_MS) return;
      lastSyncAt.current = now;
      mutateRef.current(undefined, {
        onError: (err) => {
          // Silent — foreground sync is a nice-to-have. Pull-to-refresh
          // still works if this fails (e.g. user cancelled Face ID).
          console.warn(`[plaid] foreground sync (${reason}) failed:`, err);
        },
      });
    };

    // Cold-open sync: AppState was already "active" by the time we
    // mounted. Fire once so a kill-and-relaunch still pulls.
    maybeSync("mount");

    const sub = AppState.addEventListener("change", (next) => {
      const prev = previousState.current;
      previousState.current = next;
      // Only on transitions INTO active, not active→active churn that
      // some platforms emit during initial render.
      if (next === "active" && prev !== "active") {
        maybeSync("foreground");
      }
    });

    return () => sub.remove();
  }, []);
}
