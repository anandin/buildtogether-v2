/**
 * BT API client — typed wrapper around `client/lib/query-client.ts`.
 *
 * Reuses the existing `apiRequest()` (which handles base URL + auth header
 * + error handling) so we don't fork the network layer. Each function
 * returns the parsed JSON typed as the corresponding response shape from
 * `client/bt/api/types.ts`.
 *
 * Phase 2 fills the methods that are currently 501 stubs; Phase 1 just
 * needs the surface in place so hooks compile.
 */
import { apiRequest } from "@/lib/query-client";
import type {
  TodayBrief,
  ChatHistory,
  MemoryList,
  SpendPattern,
  CreditSnapshot,
  DreamsList,
  SubscriptionsList,
  ProtectionsList,
  TonePref,
  TillyMessage,
  TillyProfile,
} from "./types";
import type { BTToneKey } from "../tones";

async function getJson<T>(route: string): Promise<T> {
  const res = await apiRequest("GET", route);
  return (await res.json()) as T;
}
async function postJson<T>(route: string, body?: unknown): Promise<T> {
  const res = await apiRequest("POST", route, body);
  return (await res.json()) as T;
}
async function putJson<T>(route: string, body?: unknown): Promise<T> {
  const res = await apiRequest("PUT", route, body);
  return (await res.json()) as T;
}

export const btApi = {
  // ── Tilly insights ───────────────────────────────────────────────────────
  today: () => getJson<TodayBrief>("/api/tilly/today"),
  spendPattern: () => getJson<SpendPattern>("/api/tilly/spend-pattern"),
  creditSnapshot: () => getJson<CreditSnapshot>("/api/tilly/credit-snapshot"),
  profile: () => getJson<TillyProfile>("/api/tilly/profile"),

  // ── Tilly chat ───────────────────────────────────────────────────────────
  chatHistory: () => getJson<ChatHistory>("/api/tilly/chat/history"),
  sendChat: (message: string) =>
    postJson<{ reply: TillyMessage }>("/api/tilly/chat", { message }),
  getTone: () => getJson<TonePref>("/api/tilly/tone"),
  setTone: (tone: BTToneKey) => putJson<TonePref>("/api/tilly/tone", { tone }),

  // ── Memory ──────────────────────────────────────────────────────────────
  memory: () => getJson<MemoryList>("/api/tilly/memory"),
  forgetMemory: (id: string) =>
    postJson<{ ok: true }>(`/api/tilly/memory/${id}/forget`),
  exportMemory: () => getJson<{ markdown: string }>("/api/tilly/memory/export"),

  // ── Dreams ──────────────────────────────────────────────────────────────
  dreams: () => getJson<DreamsList>("/api/dreams"),
  createDream: (body: {
    name: string;
    target: number;
    glyph: string;
    gradient: [string, string];
    weeklyAuto?: number;
    loc?: string;
    dueLabel?: string;
  }) => postJson<{ dream: import("./types").Dream }>("/api/dreams", body),
  contributeDream: (id: string, amount: number) =>
    postJson<{ ok: true }>(`/api/dreams/${id}/contribute`, { amount }),

  // ── Subscriptions ───────────────────────────────────────────────────────
  subscriptions: () => getJson<SubscriptionsList>("/api/subscriptions"),
  pauseSubscription: (id: string) =>
    postJson<{ ok: true }>(`/api/subscriptions/${id}/pause`),

  // ── Protections ─────────────────────────────────────────────────────────
  protections: () => getJson<ProtectionsList>("/api/protections"),
  protectionsRecent: () => getJson<ProtectionsList>("/api/protections/recent"),
  dismissProtection: (id: string) =>
    postJson<{ ok: true }>(`/api/protections/${id}/dismiss`),
  actProtection: (id: string) =>
    postJson<{ ok: true }>(`/api/protections/${id}/act`),

  // ── Manual expenses (text/voice/photo capture) ───────────────────────────
  expenses: (days = 30) =>
    getJson<{
      ready: boolean;
      expenses: Array<{
        id: string;
        amount: number;
        description: string;
        merchant: string | null;
        category: string;
        date: string;
        source: string;
      }>;
    }>(`/api/expenses?days=${days}`),
  createExpense: (body: {
    raw?: string;
    amount?: number;
    description?: string;
    merchant?: string;
    category?: string;
    source?: "manual_text" | "manual_voice";
  }) => postJson<{ ok: true; expense: any }>("/api/expenses", body),
  voiceExpense: (transcript: string) =>
    postJson<{ ok: true; expense: any; parsed: any }>("/api/expenses/voice", {
      transcript,
    }),
  photoExpense: (imageDataUrl: string) =>
    postJson<{ ok: true; expense: any; parsed: any }>("/api/expenses/photo", {
      image: imageDataUrl,
    }),

  // ── Trusted-people invites (Twilio SMS) ───────────────────────────────
  invitePerson: (body: { phone?: string; email?: string; name: string; scope: string }) =>
    postJson<{ ok: true; inviteId: string }>("/api/invites", body),

  // ── Demo seeder (sandbox / no-Plaid play mode) ───────────────────────
  seedDemo: () => postJson<{ ok: true; expensesSeeded: number }>("/api/demo/seed"),
  clearDemo: () => postJson<{ ok: true }>("/api/demo/clear"),

  // ── Splits (Venmo for US, Interac for CA) ────────────────────────────
  draftSplit: (body: {
    region?: "CA" | "US";
    direction: "owed_to_me" | "i_owe";
    recipient:
      | string
      | { name: string; handle?: string; email?: string; phone?: string };
    amount: number;
    label: string;
  }) =>
    postJson<{
      id: string;
      flow: "venmo" | "interac";
      message: string;
      // Venmo
      venmoUrl?: string;
      deeplinks?: { ios: string; android: string };
      webFallback?: string;
      // Interac
      smsHref?: string;
      smsBody?: string;
      smsTo?: string;
      bankInstructions?: { to: string; amount: string; message: string };
    }>("/api/splits/draft", body),
  splits: () =>
    getJson<{ splits: Array<{ id: string; summary: string; metadata: any; createdAt: string }> }>(
      "/api/splits",
    ),
  settleSplit: (id: string) =>
    postJson<{ ok: true }>(`/api/splits/${id}/settle`),

  // ── Household / onboarding ─────────────────────────────────────────────
  onboardingStatus: () =>
    getJson<{
      hasHousehold: boolean;
      hasCompletedOnboarding: boolean;
      hasPlaid: boolean;
      hasDream: boolean;
      hasCommitment: boolean;
    }>("/api/household/onboarding-status"),
  createHousehold: (body: { name: string; schoolName?: string; studentRole?: string }) =>
    postJson<{ householdId: string; created: boolean }>("/api/household/create", body),
  completeOnboarding: () =>
    postJson<{ ok: true }>("/api/household/complete-onboarding"),
};
