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

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);
  const authHeaders = await getAuthHeaders();

  const headers: Record<string, string> = {
    ...authHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);
    const authHeaders = await getAuthHeaders();

    const res = await fetch(url, {
      headers: authHeaders,
      credentials: "include",
    });

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
