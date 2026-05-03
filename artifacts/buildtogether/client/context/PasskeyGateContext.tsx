/**
 * PasskeyGateContext — single, app-wide Face ID re-prompt.
 *
 * Mounts one shared `<PasskeyGate />` modal at the root and exposes
 * `ensurePasskeyVerified()` which:
 *   - Resolves immediately to `true` if a verification is in progress
 *     by joining the already-pending request (concurrent callers are
 *     deduped onto a single modal instance).
 *   - Otherwise opens the gate in `enroll` mode (no passkey on the
 *     account yet) or `verify` mode and resolves with the user's
 *     decision (`true` on success, `false` on cancel).
 *
 * The network layer (`apiRequest` / `apiRequestRaw` / `getQueryFn`)
 * registers this handler at boot so any 403 PASSKEY_REQUIRED|STALE
 * response triggers the gate transparently and replays the request on
 * success — including background React Query refetches that fire while
 * the user is just looking at the Plaid screens.
 *
 * `staleSinceCancel` is set true when the user dismisses the gate; the
 * Plaid screens render an actionable banner ("Verify Face ID to
 * refresh banks") so the failure isn't silent.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PasskeyGate, type PasskeyGateMode } from "@/components/PasskeyGate";
import { apiRequestRaw, setPasskeyGuardHandler } from "@/lib/query-client";

interface PasskeyGateContextValue {
  /**
   * Open the shared gate (or join an in-flight request). Resolves
   * `true` once the user successfully enrolls / verifies, `false` if
   * they cancel.
   */
  ensurePasskeyVerified: () => Promise<boolean>;
  /**
   * True when the user dismissed the gate after a 403 — Plaid screens
   * use this to show an actionable "Verify Face ID to refresh" banner
   * instead of just an opaque error.
   */
  staleSinceCancel: boolean;
  /** Re-prompt explicitly (used by the banner's "Verify now" button). */
  reverify: () => Promise<boolean>;
  /** Hide the banner — called after a successful verification. */
  clearStale: () => void;
}

const PasskeyGateContext = createContext<PasskeyGateContextValue | null>(null);

export function PasskeyGateProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<PasskeyGateMode>("verify");
  const [staleSinceCancel, setStaleSinceCancel] = useState(false);

  // Concurrent callers (e.g. usePlaidItems + usePlaidPending refetching
  // back-to-back) all hang off the same promise so we only ever show
  // one modal at a time.
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const resolversRef = useRef<((verified: boolean) => void)[]>([]);

  const settle = useCallback((verified: boolean) => {
    const list = resolversRef.current;
    resolversRef.current = [];
    inflightRef.current = null;
    setVisible(false);
    list.forEach((r) => r(verified));
  }, []);

  const ensurePasskeyVerified = useCallback(async (): Promise<boolean> => {
    if (inflightRef.current) return inflightRef.current;
    const promise = new Promise<boolean>((resolve) => {
      resolversRef.current.push(resolve);
    });
    inflightRef.current = promise;
    // Pick the right copy/CTA. Default to `verify` — most callers hit
    // the gate because their existing freshness window (12h) lapsed,
    // not because they never enrolled. We only switch to `enroll` if
    // the session explicitly says no passkey is on file. Use opt-out
    // of the passkey guard here to avoid an infinite loop if /session
    // ever returned 403 PASSKEY_*.
    (async () => {
      let resolvedMode: PasskeyGateMode = "verify";
      try {
        const sessRes = await apiRequestRaw(
          "GET",
          "/api/auth/session",
          undefined,
          { passkeyGuard: false },
        );
        if (sessRes.ok) {
          const sess = await sessRes.json();
          resolvedMode = sess?.passkey?.enrolled ? "verify" : "enroll";
        }
      } catch {
        // Network blip — fall through with `verify`; the gate itself
        // will gracefully fall back to enrollment if no local passkey
        // is found (see PasskeyGate.run()).
      }
      setMode(resolvedMode);
      setVisible(true);
    })();
    return promise;
  }, []);

  const clearStale = useCallback(() => setStaleSinceCancel(false), []);

  const reverify = useCallback(async () => {
    const ok = await ensurePasskeyVerified();
    if (ok) setStaleSinceCancel(false);
    return ok;
  }, [ensurePasskeyVerified]);

  // Register the network-layer handler exactly once per provider mount.
  useEffect(() => {
    setPasskeyGuardHandler(ensurePasskeyVerified);
    return () => setPasskeyGuardHandler(null);
  }, [ensurePasskeyVerified]);

  const value = useMemo<PasskeyGateContextValue>(
    () => ({ ensurePasskeyVerified, staleSinceCancel, reverify, clearStale }),
    [ensurePasskeyVerified, staleSinceCancel, reverify, clearStale],
  );

  return (
    <PasskeyGateContext.Provider value={value}>
      {children}
      <PasskeyGate
        visible={visible}
        mode={mode}
        onSuccess={() => {
          setStaleSinceCancel(false);
          settle(true);
        }}
        onCancel={() => {
          setStaleSinceCancel(true);
          settle(false);
        }}
      />
    </PasskeyGateContext.Provider>
  );
}

export function usePasskeyGate(): PasskeyGateContextValue {
  const ctx = useContext(PasskeyGateContext);
  if (!ctx) {
    throw new Error("usePasskeyGate must be used inside <PasskeyGateProvider>");
  }
  return ctx;
}
