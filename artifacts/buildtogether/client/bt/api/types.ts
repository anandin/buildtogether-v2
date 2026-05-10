/**
 * BT API response types — must match server shapes in `server/tilly/*` and
 * `server/routes/*`. Keep this file the single source of truth on the
 * client; each hook in `client/bt/hooks/` re-exports the type it consumes.
 *
 * Phase 1: types present so hooks compile. Phase 2/3/4 fill the runtime data.
 */

import type { BTToneKey } from "../tones";

/** Shared envelope for read endpoints that aren't yet implemented. */
export type StubEnvelope = { phase: number; ready: false };

export type TodayBrief =
  | StubEnvelope
  | {
      ready: true;
      greeting: string;
      dayLabel: string;
      breathing: number;
      afterRent: number;
      paycheckCopy: string;
      subscriptionTile?: {
        merchant: string;
        amount: number;
        usageNote: string;
        ctaLabel: string;
        subscriptionId: string;
      };
      dreamTile?: {
        name: string;
        autoSaveCopy: string;
        saved: number;
        target: number;
      };
      tillyInvite: string;
      // Task #23: up to 3 open sync-time questions Tilly has queued for the
      // user (unknown merchant / category spike / outsized tx). Optional —
      // older API responses may omit it.
      openQuestions?: TillyQuestion[];
    };

export type TillyQuestion = {
  id: string;
  kind: "unknown_merchant" | "category_spike" | "outsized_tx" | string;
  body: string;
  payload?: Record<string, unknown>;
};

// Task #23: pending Plaid transactions grouped by merchant signature.
export type PendingGroup = {
  signature: string;
  displayName: string;
  count: number;
  totalAmount: number;
  minAmount: number;
  maxAmount: number;
  firstDate: string;
  lastDate: string;
  suggestedCategory: string | null;
  suggestedTags: string[] | null;
  suggestedNote: string | null;
  ruleId: string | null;
  sampleNames: string[];
  txnIds: string[];
};

export type ScoutProposal = { query: string; reason: string };
export type WaitProposal = { query: string; reason: string };
export type ScoutOption = {
  source: string;
  title: string;
  price?: string;
  location?: string;
  url: string;
  condition?: string;
  why: string;
};
export type WaitSource = { source: string; url: string; evidence: string };
export type ScoutStatus = "queued" | "running" | "done" | "failed";
export type WaitConfidence = "low" | "medium" | "high";

/**
 * Tool execution results attached to a Tilly turn. The server runs an
 * extract-then-execute pass after generating Tilly's text reply; each
 * detected tool call produces one result here. The chat surface renders
 * an inline preview card per result. Multi-tool turns are common
 * ("I'm 38, support 4 people in Toronto" → 3 onboarding_field_set
 * results).
 */
export type TillyToolResult =
  | {
      kind: "dream_created";
      dreamId: string;
      name: string;
      targetAmount: number;
      monthlyContribution: number;
      emoji: string;
    }
  | {
      kind: "payment_to_card_aliased";
      merchantSignature: string;
      cardName: string;
      reclassifiedCount: number;
      reclassifiedAmount: number;
    }
  | {
      kind: "category_hidden";
      category: string;
      reason: string;
    }
  | {
      kind: "home_tile_pinned";
      tileKind: string;
      label: string;
    }
  | {
      kind: "onboarding_field_set";
      field: string;
      value: string;
    }
  // ─── Inverse tool results ────────────────────────────────────────────
  | { kind: "category_unhidden"; category: string }
  | {
      kind: "payment_to_card_unaliased";
      cardName: string;
      restoredCount: number;
      restoredAmount: number;
    }
  | { kind: "home_tile_unpinned"; tileKind: string; label: string }
  | { kind: "onboarding_field_unset"; field: string }
  | { kind: "dream_deleted"; name: string }
  | {
      kind: "category_inclusion_set";
      category: string;
      includeInSpend: boolean;
      previouslyIncluded: boolean;
    }
  | {
      kind: "merchant_category_set";
      merchantSignature: string;
      displayName: string;
      fromCategory: string;
      toCategory: string;
      reclassifiedCount: number;
    };

export type UserPrefsResponse = {
  prefs: Record<string, Record<string, unknown>>;
  count: number;
};

export type TillyMessage =
  | { id: string; role: "user"; kind: "text"; body: string; createdAt: string }
  | {
      id: string;
      role: "tilly";
      kind: "text";
      body: string;
      createdAt: string;
      // Backward-compat single-tool field.
      toolResult?: TillyToolResult;
      // New: array of all tool results. Server populates both fields when
      // exactly one tool fired; only `toolResults` when multiple did.
      toolResults?: TillyToolResult[];
    }
  | { id: string; role: "tilly"; kind: "typing" }
  | {
      id: string;
      role: "tilly";
      kind: "analysis";
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
      // Task #24 — deterministic anomalies + open questions + memory provenance
      // line that ride alongside the LLM-written `note`. Optional so old
      // analysis rows persisted before #24 still parse.
      topMerchants?: { name: string; total: number; count: number }[];
      anomalies?: { merchant: string; total: number; reason: "spike" | "new"; baseline?: number }[];
      openQuestions?: string[];
      memoryLine?: string | null;
      scoutProposal?: ScoutProposal | null;
      waitProposal?: WaitProposal | null;
      createdAt: string;
    }
  | {
      id: string;
      role: "tilly";
      kind: "scout";
      jobId: string;
      query: string;
      location: string | null;
      status: ScoutStatus;
      summary: string | null;
      options: ScoutOption[];
      errorText: string | null;
      createdAt: string;
    }
  | {
      id: string;
      role: "tilly";
      kind: "wait";
      jobId: string;
      query: string;
      location: string | null;
      status: ScoutStatus;
      summary: string | null;
      shouldWait: boolean | null;
      waitUntil: string | null;
      expectedSaving: string | null;
      confidence: WaitConfidence | null;
      sources: WaitSource[];
      errorText: string | null;
      createdAt: string;
    };

export type ChatHistory = { messages: TillyMessage[] };

export type MemoryNote = {
  id: string;
  kind: "observation" | "anxiety" | "value" | "commitment" | "preference";
  body: string;
  dateLabel: string;
  noticedAt: string;
  isMostRecent: boolean;
  archivedAt: string | null;
};

export type MemoryList = { memory: MemoryNote[] };

export type DayBar = { d: string; amt: number; soft?: boolean; today?: boolean };
export type SpendTx = { id: string; name: string; date: string; amt: number };
export type SpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;
  amt: number;
  softSpot?: boolean;
  transactions: SpendTx[];
};
export type SpendPattern =
  | StubEnvelope
  | {
      ready: true;
      spent: number;
      headline: string;
      italicSpan?: string;
      bars: DayBar[];
      categories: SpendCategory[];
      /** Fixed-obligation buckets this week (loans, taxes, transfers, fees).
       * Same shape as `categories` so CategoryRow renders both lists.
       * Optional for backward-compat with cached responses pre-split. */
      fixedObligations?: SpendCategory[];
      today: { id: string; who: string; cat: string; amt: number; time: string }[];
      paycheck: { amount: number; source: string; day: string; daysUntil: number };
    };

export type CreditSnapshot =
  | StubEnvelope
  | {
      ready: true;
      used: number;
      limit: number;
      pct: number;
      target: number; // typically 30
      score?: number;
      delta?: number;
      since?: string;
      payment: { ratio: string; state: "good" | "neutral" | "warn"; note: string };
      age: { value: string; state: "good" | "neutral" | "warn"; note: string };
      inquiries: { value: string; state: "good" | "neutral" | "warn"; note: string };
      protected: string[];
    };

export type Dream = {
  id: string;
  name: string;
  glyph: string;
  loc: string;
  target: number;
  saved: number;
  weekly: number;
  due: string;
  gradient: [string, string];
  nudge: string;
};
export type DreamsList =
  | StubEnvelope
  | { ready: true; dreams: Dream[]; yearSaved: number; perDay: number };

export type Subscription = {
  id: string;
  merchant: string;
  amount: number;
  cadence: string;
  nextChargeAt: string | null;
  lastUsedAt: string | null;
  status: "active" | "paused" | "cancelled" | "flagged";
  usageNote: string | null;
  /** Per-merchant cancel/manage link (D19). */
  cancelLink?: { url: string; verb: "cancel" | "manage" | "review"; surface: string };
};
export type SubscriptionsList =
  | StubEnvelope
  | { ready: true; subscriptions: Subscription[] };

export type Protection = {
  id: string;
  kind: "phishing" | "free_trial" | "unused_sub" | "unusual_charge" | "overdraft_risk";
  severity: "fyi" | "decision_needed" | "act_today";
  summary: string;
  detail?: string;
  ctaLabel?: string;
  ctaAction?: string;
  ctaTargetId?: string;
  flaggedAt: string;
  status: "flagged" | "dismissed" | "acted" | "expired";
};
export type ProtectionsList =
  | StubEnvelope
  | { ready: true; protections: Protection[] };

export type TonePref = { tone: BTToneKey; phase?: number };

export type TrustedPerson = {
  id: string;
  name: string;
  rel: string;
  scope: string;
  hue: "accent" | "accent2" | "warn";
};

export type TillyProfile =
  | { ready: false; reason?: string }
  | {
      ready: true;
      name: string;
      school: string | null;
      studentRole: string | null;
      daysWithTilly: number;
      tone: BTToneKey;
      trusted: TrustedPerson[];
      lifeContext: {
        employmentType: string | null;
        ageBand: string | null;
        city: string | null;
        dependents: number | null;
        supportNote: string | null;
      } | null;
    };

// ── Plaid ──────────────────────────────────────────────────────────────
export type PlaidStatus = { configured: boolean; environment: string };

export type PlaidItem = {
  id: string;
  institutionName: string;
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type PlaidPendingTransaction = {
  id: string;
  amount: number;
  date: string;
  merchantName: string | null;
  name: string;
  ourCategory: string | null;
  pending: boolean;
  status: "pending_review" | "accepted" | "ignored";
  // Task #23 — normalized merchant key written by the sync hook. Older rows
  // (pre-#23) may not have this; clients should treat null as "no group".
  signature: string | null;
  // Phase 3 — Tilly's category guess written at sync time when no merchant
  // rule existed yet. UI surfaces "Tilly thinks: dining" with one-tap confirm.
  // Null when classification was skipped or failed.
  aiSuggestedCategory: string | null;
  aiSuggestedTags: string[] | null;
  aiSuggestedConfidence: number | null;
  // One-sentence rationale Tilly returns alongside the category. Renders
  // verbatim on the Pending card so LOANS/FEES badges feel reasoned, not
  // silently assigned. Null when classification was skipped/failed/older.
  aiSuggestedReasoning: string | null;
};
