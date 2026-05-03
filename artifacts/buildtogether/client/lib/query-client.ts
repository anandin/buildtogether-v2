import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getToken } from "@/context/AuthContext";

/**
 * Gets the base URL for the Express API server.
 *
 * Priority:
 *   1. EXPO_PUBLIC_DOMAIN env var (set in .env / EAS secrets) — overrides
 *      everything. Use this for staging or to point a beta build at a
 *      preview deploy.
 *   2. window.location.origin — for the web build (we always serve API
 *      from the same origin).
 *   3. The hardcoded production domain — for native builds (Expo Go,
 *      EAS dev/preview/prod) where there's no window. Without this,
 *      the app crashes on launch with "EXPO_PUBLIC_DOMAIN is not set".
 */
const PROD_API_DOMAIN = "buildtogether-v2.vercel.app";

export function getApiUrl(): string {
  const envHost = process.env.EXPO_PUBLIC_DOMAIN;
  if (envHost) {
    return new URL(`https://${envHost}`).href;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin + "/";
  }
  // Native — fall through to the production deploy.
  return new URL(`https://${PROD_API_DOMAIN}`).href;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Module-level passkey-gate handler. Registered by `PasskeyGateProvider`
 * at app boot so the network layer can transparently re-prompt for Face ID
 * when the server returns 403 `PASSKEY_REQUIRED` / `PASSKEY_STALE`.
 *
 * Kept as a module global (rather than threaded through hooks) so that
 * background React Query refetches and any non-React callers participate
 * in the same gate-and-retry behaviour.
 */
type PasskeyGuardHandler = () => Promise<boolean>;
let _passkeyGuardHandler: PasskeyGuardHandler | null = null;
export function setPasskeyGuardHandler(handler: PasskeyGuardHandler | null) {
  _passkeyGuardHandler = handler;
}

async function detectPasskeyChallenge(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = await res.clone().json();
    return body?.code === "PASSKEY_REQUIRED" || body?.code === "PASSKEY_STALE";
  } catch {
    return false;
  }
}

/**
 * Wraps a fetch thunk so that a 403 PASSKEY_REQUIRED|STALE pops the shared
 * Face ID gate (if registered) and replays the request once on success.
 * No-op when no handler is mounted (e.g. during early app boot or in
 * non-React unit tests) or when the caller opts out.
 */
async function withPasskeyGuard(
  doFetch: () => Promise<Response>,
  enabled: boolean,
): Promise<Response> {
  const res = await doFetch();
  if (!enabled || !_passkeyGuardHandler) return res;
  if (!(await detectPasskeyChallenge(res))) return res;
  const verified = await _passkeyGuardHandler();
  if (!verified) return res;
  return doFetch();
}

export interface ApiRequestOptions {
  /**
   * When true (default), a 403 PASSKEY_REQUIRED|STALE response is
   * intercepted: the shared PasskeyGate is opened, and the request is
   * replayed after the user verifies. Set to false for components that
   * own their own gate UX (e.g. PlaidConnectButton's enroll → disclosure
   * → Plaid Link sequence) and need to inspect the raw 403.
   */
  passkeyGuard?: boolean;
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  opts?: ApiRequestOptions,
): Promise<Response> {
  const res = await apiRequestRaw(method, route, data, opts);
  await throwIfResNotOk(res);
  return res;
}

/**
 * Same as apiRequest but does NOT throw on non-2xx — callers can inspect
 * `res.status` themselves. Used by flows that need to react to specific
 * status codes (e.g. 403 PASSKEY_REQUIRED before launching Plaid Link).
 *
 * By default this also routes 403 PASSKEY_REQUIRED|STALE through the
 * shared passkey gate and replays on success; pass `{ passkeyGuard: false }`
 * to opt out when the caller owns the gate UX itself.
 */
export async function apiRequestRaw(
  method: string,
  route: string,
  data?: unknown | undefined,
  opts?: ApiRequestOptions,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const doFetch = async () => {
    const authHeaders = await getAuthHeaders();
    const headers: Record<string, string> = {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
    };
    return fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  };

  return withPasskeyGuard(doFetch, opts?.passkeyGuard !== false);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const doFetch = async () => {
      const authHeaders = await getAuthHeaders();
      return fetch(url, {
        headers: authHeaders,
        credentials: "include",
      });
    };

    // Background refetches go through the same shared passkey gate so
    // that an expired Face ID verification surfaces the prompt instead
    // of bubbling up an opaque 403 to the screen.
    const res = await withPasskeyGuard(doFetch, true);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
