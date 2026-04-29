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
    };

export type TillyMessage =
  | { id: string; role: "user"; kind: "text"; body: string; createdAt: string }
  | { id: string; role: "tilly"; kind: "text"; body: string; createdAt: string }
  | { id: string; role: "tilly"; kind: "typing" }
  | {
      id: string;
      role: "tilly";
      kind: "analysis";
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
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
export type SpendCategory = {
  id: string;
  name: string;
  hue: "accent" | "accent2" | "good" | "warn" | "inkSoft";
  context: string;
  amt: number;
  softSpot?: boolean;
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
    };
