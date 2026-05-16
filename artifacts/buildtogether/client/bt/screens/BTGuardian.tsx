/**
 * BTGuardian — Tilly chat. Spec §4.2 + §5.6 (quick-math analysis card).
 *
 * Multi-turn chat with three message kinds: text, typing, analysis.
 * The composer + suggested prompts let the user start a thread; the seeded
 * affordability question demonstrates Tilly's "show your math, then make a
 * human call" format.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BT_SUGGESTED_PROMPTS } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTCard, BTLabel, BTRule, BTSerif } from "../atoms";
import { BTFonts } from "../theme";
import { useTilly as useTillyChat } from "../hooks/useTilly";
import { useToday } from "../hooks/useToday";
import { useSpend } from "../hooks/useSpend";
import { useTillyQuestions, useAnswerTillyQuestion } from "../hooks/useTillyQuestions";
import { useUser } from "../hooks/useUser";
import { MemoryInspector } from "../MemoryInspector";
import type { TillyMessage } from "../api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

type ToolPreview =
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
  // Inverse-tool result variants — rendered inline same as forward.
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
    }
  | {
      kind: "merchant_renamed";
      merchantSignature: string;
      previousName: string;
      newName: string;
      renamedCount: number;
    }
  | {
      kind: "scout_started";
      mode: "find";
      jobId: string;
      query: string;
      location: string | null;
    }
  | {
      kind: "wait_started";
      mode: "wait";
      jobId: string;
      query: string;
      location: string | null;
    }
  | {
      kind: "watchlist_item_added";
      itemId: string;
      name: string;
      estimatedPrice: number | null;
    }
  | {
      kind: "income_aliased_to_transfer";
      merchantSignature: string;
      sourceName: string;
      reclassifiedCount: number;
      reclassifiedAmount: number;
    };

// Backward-compat alias for the existing single-tool field.
type DreamPreview = Extract<ToolPreview, { kind: "dream_created" }>;

type Msg =
  | { id: string; role: "user"; kind: "text"; body: string }
  | {
      id: string;
      role: "tilly";
      kind: "text";
      body: string;
      toolResult?: ToolPreview;
      toolResults?: ToolPreview[];
    }
  | { id: string; role: "tilly"; kind: "typing" }
  | {
      id: string;
      role: "tilly";
      kind: "analysis";
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
      topMerchants?: { name: string; total: number; count: number }[];
      anomalies?: { merchant: string; total: number; reason: "spike" | "new"; baseline?: number }[];
      openQuestions?: string[];
      memoryLine?: string | null;
      scoutProposal?: import("../api/types").ScoutProposal | null;
      waitProposal?: import("../api/types").WaitProposal | null;
    }
  | { id: string; role: "tilly"; kind: "analysing" }
  | {
      id: string;
      role: "tilly";
      kind: "scout";
      jobId: string;
      query: string;
      location: string | null;
      status: import("../api/types").ScoutStatus;
      summary: string | null;
      options: import("../api/types").ScoutOption[];
      errorText: string | null;
    }
  | {
      id: string;
      role: "tilly";
      kind: "wait";
      jobId: string;
      query: string;
      location: string | null;
      status: import("../api/types").ScoutStatus;
      summary: string | null;
      shouldWait: boolean | null;
      waitUntil: string | null;
      expectedSaving: string | null;
      confidence: import("../api/types").WaitConfidence | null;
      sources: import("../api/types").WaitSource[];
      errorText: string | null;
    };

/** Adapts a server TillyMessage to the local Msg shape used by the bubbles. */
function toLocal(m: TillyMessage): Msg {
  if (m.role === "user") return { id: m.id, role: "user", kind: "text", body: m.body };
  if (m.kind === "typing") return { id: m.id, role: "tilly", kind: "typing" };
  if (m.kind === "analysis") {
    return {
      id: m.id,
      role: "tilly",
      kind: "analysis",
      title: m.title,
      rows: m.rows,
      note: m.note,
      topMerchants: m.topMerchants ?? [],
      anomalies: m.anomalies ?? [],
      openQuestions: m.openQuestions ?? [],
      memoryLine: m.memoryLine ?? null,
      scoutProposal: m.scoutProposal ?? null,
      waitProposal: m.waitProposal ?? null,
    };
  }
  if (m.kind === "scout") {
    return {
      id: m.id,
      role: "tilly",
      kind: "scout",
      jobId: m.jobId,
      query: m.query,
      location: m.location,
      status: m.status,
      summary: m.summary,
      options: m.options,
      errorText: m.errorText,
    };
  }
  if (m.kind === "wait") {
    return {
      id: m.id,
      role: "tilly",
      kind: "wait",
      jobId: m.jobId,
      query: m.query,
      location: m.location,
      status: m.status,
      summary: m.summary,
      shouldWait: m.shouldWait,
      waitUntil: m.waitUntil,
      expectedSaving: m.expectedSaving,
      confidence: m.confidence,
      sources: m.sources,
      errorText: m.errorText,
    };
  }
  return {
    id: m.id,
    role: "tilly",
    kind: "text",
    body: m.body,
    toolResult: (m as any).toolResult as ToolPreview | undefined,
    toolResults: (m as any).toolResults as ToolPreview[] | undefined,
  };
}

export function BTGuardian() {
  const { t, tone } = useBT();
  const { user } = useUser();
  const tilly = useTillyChat();
  // Pull the same data the home + spend screens render so we can pass
  // it as screenContext on every chat send. Tilly's chat handler reads
  // this and treats it as "what the user is looking at right now",
  // closing the perception gap she used to apologize for ("I can't
  // see your home screen"). Tiny snapshot — just the structural
  // fields, not transaction arrays.
  const today = useToday();
  const spend = useSpend();
  const buildScreenContext = (): Record<string, unknown> | null => {
    const t_ = today.data && today.data.ready === true ? today.data : null;
    const s_ = spend.data && spend.data.ready === true ? spend.data : null;
    if (!t_ && !s_) return null;
    return {
      home: t_
        ? {
            monthly: t_.monthly ?? null,
            forwardLook: t_.forwardLook ?? null,
            heroNarrative: t_.heroNarrative ?? null,
          }
        : null,
      spend: s_
        ? {
            range: "week",
            spent: s_.spent,
            headline: s_.headline,
            barsTotal: (s_.bars ?? []).reduce(
              (sum: number, b: { amt: number }) => sum + (b.amt || 0),
              0,
            ),
            categoryNames: (s_.categories ?? [])
              .slice(0, 8)
              .map((c: { name: string }) => c.name),
            fixedObligationNames: (s_.fixedObligations ?? [])
              .slice(0, 8)
              .map((c: { name: string }) => c.name),
          }
        : null,
    };
  };
  const [draft, setDraft] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  // Task #23 — when the user taps an open Tilly question chip, we stash
  // its id here so the next composer submit ALSO posts the typed reply
  // to /api/tilly/questions/:id/answer (closing the question + writing
  // it to tillyMemory). Cleared on submit or when the user changes
  // course (composer cleared without sending).
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const openQuestions = useTillyQuestions();
  const answerQuestion = useAnswerTillyQuestion();
  const scrollRef = useRef<ScrollView>(null);

  // First-time UX: when the conversation is empty, render Tilly's actual
  // tone-appropriate greeting instead of a fake pre-baked exchange. The
  // BT_CHAT_SEED constant stays available as a demo fallback if the live
  // user has no name resolved yet (very first render before /api/auth/session
  // returns), but normally the greeting comes from `tone.greeting(name) +
  // tone.sample`.
  const userName = user?.name?.split(" ")[0] || "there";
  const firstTimeMessages: Msg[] = [
    {
      id: "tilly-greeting",
      role: "tilly",
      kind: "text",
      body: `${tone.greeting(userName)} ${tone.sample}`,
    },
  ];
  const baseMessages: Msg[] =
    tilly.messages.length > 0
      ? tilly.messages.map(toLocal)
      : firstTimeMessages;
  // While the analysis mutation is in flight, drop a transient
  // "Tilly is looking…" placeholder bubble at the end of the list so
  // the user sees activity in the chat (not just the button spinner).
  // Removed automatically when the mutation resolves.
  const messages: Msg[] = tilly.isAnalysing
    ? [...baseMessages, { id: "analysing-placeholder", role: "tilly", kind: "analysing" }]
    : baseMessages;

  const thinking = tilly.isThinking;

  useEffect(() => {
    // auto-scroll on new content
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, thinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Task #23 — if this submit is in response to a tapped open question,
    // close the question on the server first (writes to tillyMemory so
    // Tilly remembers the answer next sync). Best-effort: a network blip
    // shouldn't block the actual chat send.
    if (pendingQuestionId) {
      answerQuestion.mutate({ id: pendingQuestionId, answer: trimmed });
      setPendingQuestionId(null);
    }
    setDraft("");
    tilly.send(trimmed, buildScreenContext());
  };

  // Map the strings we already render in the bubble's "Still wondering"
  // section back to question ids from the live questions list, so a tap
  // can bind to a real /api/tilly/questions/:id.
  const findQuestionIdByBody = (body: string): string | null => {
    const list = openQuestions.data?.questions ?? [];
    return list.find((q) => q.body === body)?.id ?? null;
  };

  const tillyState: "idle" | "think" = thinking ? "think" : "idle";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // The bottom tab bar is ~70px; offset so the keyboard pushes the
      // composer above it without leaving a black gap.
      keyboardVerticalOffset={Platform.OS === "ios" ? 70 : 0}
      style={{ flex: 1, backgroundColor: t.bg }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 18,
          paddingTop: 28,
        }}
      >
        <Tilly t={t} size={48} state={tillyState} breathing={!thinking} />
        <View style={{ flex: 1 }}>
          <BTSerif size={26} color={t.ink}>
            Tilly
          </BTSerif>
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {tone.voice}
          </Text>
        </View>
        <Pressable
          onPress={() => setMemoryOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open memory inspector"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <BTLabel color={t.inkSoft} size={10}>memory</BTLabel>
        </Pressable>
      </View>
      <MemoryInspector
        visible={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        onPrefillCompose={(seed) => {
          setMemoryOpen(false);
          setDraft(seed);
        }}
      />

      <BTRule color={t.rule} />

      {/* Chat scroll */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 24 }}
      >
        {messages.map((m) => (
          <Bubble
            key={m.id}
            m={m}
            onScout={(query) => tilly.scout({ query, sourceMessageId: m.id })}
            onAskWait={(query) => tilly.askWait({ query, sourceMessageId: m.id })}
            scouting={tilly.isScouting}
            askingWait={tilly.isAskingWait}
            confirmedReminder={tilly.confirmedReminders[m.id] ?? null}
            onPrefillCompose={(seed) => {
              setDraft(`About "${seed}" — `);
              setPendingQuestionId(findQuestionIdByBody(seed));
            }}
          />
        ))}
        {thinking ? <TypingBubble /> : null}
      </ScrollView>

      {/* Suggested prompts — vertical stack per design/screens.jsx. Each
          prompt is a left-aligned bordered button, not a pill. Only renders
          when the user hasn't started a conversation yet (idle, no thinking
          state). */}
      {!thinking && tilly.messages.length <= 1 ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 14, gap: 6 }}>
          <BTLabel color={t.inkMute}>Try asking</BTLabel>
          {BT_SUGGESTED_PROMPTS.map((p) => (
            <Pressable
              key={p}
              onPress={() => send(p)}
              accessibilityRole="button"
              accessibilityLabel={`Suggested: ${p}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: t.rule,
                alignItems: "flex-start",
              }}
            >
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.sans,
                  fontSize: 13,
                }}
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* "Analyse my money flow" — task #24. Throttled server-side to
          once per 3 min; 429 surfaces tilly.analyseError as a toast-like
          line under the button. Sits right above the composer so it's
          always reachable but never competes with typing. */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 8,
          gap: 4,
          backgroundColor: t.surface,
        }}
      >
        <Pressable
          onPress={() => tilly.runAnalysis()}
          disabled={tilly.isAnalysing}
          accessibilityRole="button"
          accessibilityLabel="Analyse my money flow"
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.rule,
            alignItems: "center",
            opacity: tilly.isAnalysing ? 0.55 : 1,
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {tilly.isAnalysing ? <ActivityIndicator size="small" color={t.ink} /> : null}
          <Text
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {tilly.isAnalysing ? "Analysing…" : "✦  Analyse my money flow"}
          </Text>
        </Pressable>
        {tilly.analyseError ? (
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 12,
              fontStyle: "italic",
              color: t.inkMute,
              textAlign: "center",
              paddingTop: 2,
            }}
          >
            {tilly.analyseError}
          </Text>
        ) : null}
      </View>

      {/* Composer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          padding: 12,
          paddingBottom: 24,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: t.rule,
          backgroundColor: t.surface,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Talk to Tilly…"
          placeholderTextColor={t.inkMute}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
          style={{
            flex: 1,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: t.surfaceAlt,
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={() => send(draft)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: t.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({
  m,
  onScout,
  onAskWait,
  scouting,
  askingWait,
  confirmedReminder,
  onPrefillCompose,
}: {
  m: Msg;
  onScout: (query: string) => void;
  onAskWait: (query: string) => void;
  scouting: boolean;
  askingWait: boolean;
  confirmedReminder: { label: string; fireAt: string } | null;
  // Task #23 — tap an open Tilly question to prefill the composer with
  // the user's reply seed so they can answer inline without leaving chat.
  onPrefillCompose?: (seed: string) => void;
}) {
  const { t } = useBT();

  if (m.role === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "78%" }}>
        <View
          style={{
            backgroundColor: t.ink,
            // Asymmetric corners give the bubble a "tail" anchor toward the
            // right edge — matches design/screens.jsx user bubble shape.
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 14,
            borderBottomRightRadius: 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontSize: 14 }}>
            {(m as { body: string }).body}
          </Text>
        </View>
      </View>
    );
  }

  if (m.kind === "typing") return <TypingBubble />;

  if (m.kind === "analysing") {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "92%" }}>
        <Tilly t={t} size={28} state="think" breathing={false} />
        <BTCard t={t} alt padding={14} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ActivityIndicator size="small" color={t.ink} />
          <Text style={{ fontFamily: BTFonts.serif, fontSize: 15, color: t.ink, fontStyle: "italic" }}>
            Tilly is looking through your last 90 days…
          </Text>
        </BTCard>
      </View>
    );
  }

  if (m.kind === "analysis") {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "92%" }}>
        <Tilly t={t} size={28} breathing={false} />
        <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 10 }}>
          <BTLabel color={t.inkMute} size={10}>
            {m.title}
          </BTLabel>
          <View style={{ gap: 6 }}>
            {m.rows.map((r, i) => {
              const color = r.sign === "-" ? t.bad : r.sign === "=" ? t.good : t.ink;
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      fontFamily: BTFonts.mono,
                      fontSize: 11,
                      color: t.inkSoft,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: BTFonts.mono,
                      fontSize: 12,
                      fontWeight: "700",
                      color,
                    }}
                  >
                    {r.sign === "-" ? "−" : ""}${Math.abs(r.amt).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
          <BTRule color={t.rule} />
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 16,
              lineHeight: 22,
              color: t.ink,
            }}
          >
            {m.note}
          </Text>
          {m.topMerchants && m.topMerchants.length > 0 ? (
            <View style={{ gap: 4 }}>
              <BTLabel color={t.inkMute} size={10}>Top merchants</BTLabel>
              {m.topMerchants.slice(0, 8).map((tm, i) => (
                <View
                  key={`tm${i}`}
                  style={{ flexDirection: "row", justifyContent: "space-between" }}
                >
                  <Text
                    style={{ fontFamily: BTFonts.sans, fontSize: 13, color: t.ink, flex: 1 }}
                    numberOfLines={1}
                  >
                    {tm.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: BTFonts.mono,
                      fontSize: 12,
                      fontWeight: "700",
                      color: t.ink,
                    }}
                  >
                    ${tm.total.toFixed(2)}
                    <Text style={{ color: t.inkMute, fontWeight: "400" }}>
                      {" "}· {tm.count}×
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {m.anomalies && m.anomalies.length > 0 ? (
            <View style={{ gap: 4 }}>
              <BTLabel color={t.inkMute} size={10}>Worth a second look</BTLabel>
              {m.anomalies.map((a, i) => (
                <Text
                  key={`a${i}`}
                  style={{ fontFamily: BTFonts.sans, fontSize: 13, color: t.ink }}
                >
                  • {a.merchant} — ${a.total.toFixed(2)}{" "}
                  <Text style={{ color: t.inkMute, fontStyle: "italic" }}>
                    {a.reason === "new"
                      ? "(new this month)"
                      : `(usually ~$${(a.baseline ?? 0).toFixed(2)}/mo)`}
                  </Text>
                </Text>
              ))}
            </View>
          ) : null}
          {m.openQuestions && m.openQuestions.length > 0 ? (
            <View style={{ gap: 6 }}>
              <BTLabel color={t.inkMute} size={10}>Still wondering — tap to answer below</BTLabel>
              {m.openQuestions.map((q, i) => (
                <Pressable
                  key={`q${i}`}
                  onPress={() => onPrefillCompose?.(q)}
                  accessibilityRole="button"
                  accessibilityLabel={`Answer: ${q}`}
                  style={({ pressed }) => ({
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: t.rule,
                    backgroundColor: pressed ? t.chip : "transparent",
                  })}
                >
                  <Text
                    style={{ fontFamily: BTFonts.serif, fontSize: 14, color: t.inkSoft, fontStyle: "italic" }}
                  >
                    — {q}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {m.memoryLine ? (
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 11, color: t.inkMute }}>
              {m.memoryLine}
            </Text>
          ) : null}
          {m.scoutProposal || m.waitProposal ? (
            <ProposalCTAs
              scoutProposal={m.scoutProposal ?? null}
              waitProposal={m.waitProposal ?? null}
              onScout={() => m.scoutProposal && onScout(m.scoutProposal.query)}
              onAskWait={() => m.waitProposal && onAskWait(m.waitProposal.query)}
              scouting={scouting}
              askingWait={askingWait}
            />
          ) : null}
        </BTCard>
      </View>
    );
  }

  if (m.kind === "scout") {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "92%" }}>
        <Tilly t={t} size={28} breathing={m.status !== "running" && m.status !== "queued"} state={m.status === "running" || m.status === "queued" ? "think" : "idle"} />
        <ScoutBubble m={m} />
      </View>
    );
  }

  if (m.kind === "wait") {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "92%" }}>
        <Tilly t={t} size={28} breathing={m.status !== "running" && m.status !== "queued"} state={m.status === "running" || m.status === "queued" ? "think" : "idle"} />
        <WaitBubble m={m} />
      </View>
    );
  }

  // tilly text — but if Tilly wrote a Starting buffer / Final buffer
  // ledger inline, promote it to the structured Quick Math card so it
  // matches the design (mono labels, right-aligned numbers, green
  // closing balance). Bypasses the structured-output flake on Sonnet
  // by parsing the plain-text reply we already have.
  const body = (m as { body: string }).body;
  const parsed = parseQuickMath(body);
  if (parsed) {
    return (
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "92%" }}>
        <Tilly t={t} size={28} breathing={false} />
        <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 10 }}>
          <BTLabel color={t.inkMute} size={10}>
            Quick math
          </BTLabel>
          <View style={{ gap: 6 }}>
            {parsed.rows.map((r, i) => {
              const color = r.sign === "-" ? t.bad : r.sign === "=" ? t.good : t.ink;
              return (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      fontFamily: BTFonts.mono,
                      fontSize: 11,
                      color: t.inkSoft,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    {r.label}
                  </Text>
                  <Text
                    style={{
                      fontFamily: BTFonts.mono,
                      fontSize: 12,
                      fontWeight: "700",
                      color,
                    }}
                  >
                    {r.sign === "-" ? "−" : ""}${Math.abs(r.amt).toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
          <BTRule color={t.rule} />
          <RichTillyText body={parsed.note} color={t.ink} />
        </BTCard>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "82%" }}>
      <Tilly t={t} size={26} breathing={false} />
      <View style={{ flexShrink: 1 }}>
        <View
          style={{
            backgroundColor: t.surface,
            // Asymmetric: round except bottom-left, mirroring the user
            // bubble's bottom-right tail. Anchors the bubble to its avatar.
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: 4,
            borderBottomRightRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <RichTillyText body={body} color={t.ink} />
        </View>
        {confirmedReminder ? (
          <ReminderConfirmationChip reminder={confirmedReminder} />
        ) : null}
        {/* Tool result previews — one inline card per tool the unified
            extractor fired this turn. Multi-tool turns ("I'm 38, support
            4, in Toronto") render multiple cards stacked. Falls back to
            the legacy single `toolResult` when only one fired (older
            client field). */}
        {m.kind === "text"
          ? renderToolPreviews(m.toolResults, m.toolResult, t)
          : null}
      </View>
    </View>
  );
}

function renderToolPreviews(
  toolResults: ToolPreview[] | undefined,
  legacy: ToolPreview | undefined,
  t: ReturnType<typeof useBT>["t"],
) {
  const results = toolResults && toolResults.length > 0
    ? toolResults
    : legacy
      ? [legacy]
      : [];
  if (results.length === 0) return null;
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      {results.map((r, i) => (
        <ToolPreviewCard key={`${r.kind}-${i}`} result={r} t={t} />
      ))}
    </View>
  );
}

function ToolPreviewCard({
  result,
  t,
}: {
  result: ToolPreview;
  t: ReturnType<typeof useBT>["t"];
}) {
  const baseStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: t.accentSoft,
    borderColor: t.accent,
  };

  if (result.kind === "dream_created") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 22 }}>{result.emoji || "✺"}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 14,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            {result.name}
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            ${result.targetAmount.toFixed(0)} target
            {result.monthlyContribution > 0
              ? ` · $${result.monthlyContribution.toFixed(0)}/mo`
              : ""}{" "}
            · saved as a Dream
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "payment_to_card_aliased") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>💳</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            Stopped counting {result.cardName} as spending
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.reclassifiedCount} past charge
            {result.reclassifiedCount === 1 ? "" : "s"} · $
            {Math.round(result.reclassifiedAmount).toLocaleString()} moved out
            of loans
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Not what you meant? Tell me to bring {result.cardName} back.
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "income_aliased_to_transfer") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>↔️</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            Stopped counting {result.sourceName} as income
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.reclassifiedCount} past deposit
            {result.reclassifiedCount === 1 ? "" : "s"} · $
            {Math.round(result.reclassifiedAmount).toLocaleString()} treated as
            transfer now
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Your savings rate just dropped accordingly. Say so if you want it back.
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "category_hidden") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>🙈</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 12,
              color: t.ink,
            }}
          >
            Hidden <Text style={{ fontWeight: "700" }}>{result.category}</Text>{" "}
            from your Spend page.
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              marginTop: 4,
              fontStyle: "italic",
            }}
          >
            Not what you meant? Tell me to bring {result.category} back, or
            open Memory.
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "home_tile_pinned") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>📌</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          Pinned <Text style={{ fontWeight: "700" }}>{result.label}</Text> to
          your Today screen.
        </Text>
      </View>
    );
  }

  if (result.kind === "onboarding_field_set") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>📝</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          Noted: {humanizeOnboardingField(result.field)} ={" "}
          <Text style={{ fontWeight: "700" }}>{result.value}</Text>
        </Text>
      </View>
    );
  }

  // ─── Inverse-tool variants ──────────────────────────────────────────
  if (result.kind === "category_unhidden") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>👁️</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{result.category}</Text> visible
          on your Spend page again.
        </Text>
      </View>
    );
  }

  if (result.kind === "payment_to_card_unaliased") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>↩️</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            {result.cardName} payments back as spending
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.restoredCount} row
            {result.restoredCount === 1 ? "" : "s"} · $
            {Math.round(result.restoredAmount).toLocaleString()} restored to
            their original categories
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "home_tile_unpinned") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>📌</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          Unpinned <Text style={{ fontWeight: "700" }}>{result.label}</Text>{" "}
          from Today.
        </Text>
      </View>
    );
  }

  if (result.kind === "onboarding_field_unset") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>🧹</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          Cleared{" "}
          <Text style={{ fontWeight: "700" }}>
            {humanizeOnboardingField(result.field)}
          </Text>{" "}
          from what I remember.
        </Text>
      </View>
    );
  }

  if (result.kind === "dream_deleted") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>🗑️</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          Deleted <Text style={{ fontWeight: "700" }}>{result.name}</Text>{" "}
          dream.
        </Text>
      </View>
    );
  }

  if (result.kind === "merchant_category_set") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>↪️</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            Moved {result.displayName}
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.fromCategory} → {result.toCategory}
            {result.reclassifiedCount > 0
              ? ` · ${result.reclassifiedCount} past charge${result.reclassifiedCount === 1 ? "" : "s"} updated`
              : ""}
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "merchant_renamed") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>✎</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            Renamed to {result.newName}
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.previousName} → {result.newName}
            {result.renamedCount > 0
              ? ` · ${result.renamedCount} past charge${result.renamedCount === 1 ? "" : "s"} updated`
              : ""}
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "watchlist_item_added") {
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>👀</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 13,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            On your watchlist
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 12,
              color: t.inkSoft,
              marginTop: 2,
            }}
          >
            {result.name}
            {result.estimatedPrice
              ? ` · ≈ $${Math.round(result.estimatedPrice).toLocaleString()}`
              : ""}
          </Text>
        </View>
      </View>
    );
  }

  if (result.kind === "scout_started" || result.kind === "wait_started") {
    // Lightweight pill — the real scout/wait card lands as a separate
    // guardian_conversations row on the next history refetch (see
    // useTilly cache invalidation). This pill just confirms the tool
    // fired so the user understands Tilly is actually working on it.
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>✦</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          {result.mode === "wait" ? "Looking up sale history for " : "Scouting "}
          <Text style={{ fontWeight: "700" }}>{result.query}</Text>
          {result.location ? ` in ${result.location}` : ""}.
        </Text>
      </View>
    );
  }

  if (result.kind === "category_inclusion_set") {
    const verb = result.includeInSpend ? "Counting" : "Treating";
    const dest = result.includeInSpend ? "monthly spend" : "money flow only";
    return (
      <View style={baseStyle}>
        <Text style={{ fontSize: 18 }}>{result.includeInSpend ? "➕" : "➖"}</Text>
        <Text
          style={{
            flex: 1,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            color: t.ink,
          }}
        >
          {verb} <Text style={{ fontWeight: "700" }}>{result.category}</Text>{" "}
          as {dest}.
        </Text>
      </View>
    );
  }

  return null;
}

function humanizeOnboardingField(field: string): string {
  const map: Record<string, string> = {
    employmentType: "work",
    ageBand: "age",
    city: "city",
    dependents: "people you support",
    supportNote: "context",
    schoolName: "school",
  };
  return map[field] ?? field;
}

/**
 * Parse Tilly's plain-text affordability reply into a structured Quick
 * Math card. Tilly's persona prompt asks her to lay out a ledger as
 * "<label>  $<amt>" lines with positives, negatives ("-$X"), and a
 * "Final buffer / Final position $X" closing line.
 *
 * Returns null when the reply doesn't look like a ledger so plain text
 * still renders normally.
 */
function parseQuickMath(
  body: string,
): { rows: { label: string; amt: number; sign: "+" | "-" | "=" }[]; note: string } | null {
  // Look for at least one "starting / available" line and a "final / total /
  // buffer left" closing line — that's the shape of an affordability ledger.
  const hasStart = /\b(starting|available|on hand|buffer)\b/i.test(body);
  const hasFinal = /\b(final|buffer left|left over|after|total)\b.*\$\d/i.test(body);
  if (!hasStart || !hasFinal) return null;

  // Pull "<label>   $<amt>" or "<label>   -$<amt>" lines out of the reply.
  const rows: { label: string; amt: number; sign: "+" | "-" | "=" }[] = [];
  const lines = body.split(/\n/);
  let lastLedgerIdx = -1;
  lines.forEach((line, i) => {
    const m = line.match(/^\s*([A-Za-z][A-Za-z'\- ()]{2,40}?)\s+(-?\$?\s?-?\$?\d{1,4}(?:\.\d{1,2})?)\s*$/);
    if (!m) return;
    const label = m[1].trim();
    const rawAmt = m[2].replace(/\$|\s/g, "");
    const amt = Math.abs(Number(rawAmt));
    if (!isFinite(amt)) return;
    const isNeg = /^-/.test(m[2].trim()) || /^-\$/.test(m[2].trim()) || /^\$\s?-/.test(m[2].trim()) || rawAmt.startsWith("-");
    const isFinalRow = /\b(final|buffer left|left over|total)\b/i.test(label);
    rows.push({
      label,
      amt,
      sign: isFinalRow ? "=" : isNeg ? "-" : "+",
    });
    lastLedgerIdx = i;
  });

  if (rows.length < 3) return null;
  if (!rows.some((r) => r.sign === "=")) return null;

  // Everything after the last ledger line is the note.
  const note = lines
    .slice(lastLedgerIdx + 1)
    .join("\n")
    .replace(/^[\s-]+/, "")
    .trim();
  if (!note) return null;

  return { rows, note };
}

type LedgerRow = {
  label: string;
  amt: number;
  isNegative: boolean;
  isTotal: boolean;
  hadDollar: boolean;
};

/**
 * Detect a contiguous "label   $amount" ledger block. Returns the parsed
 * rows when *every* non-empty line in the block matches the ledger shape
 * and there are at least 3 rows. Used by RichTillyText to render an
 * inline expense breakdown (the "what's killing my budget?" reply) with
 * the same mono-tabular styling the design backup uses for the Quick
 * Math card.
 *
 * Sign and total are tracked independently so a "total spent  -$201"
 * row keeps its negative polarity (rendered as −$201.00 in the bad
 * color) while still getting the bold-ink "this is the total" emphasis.
 *
 * To avoid false-positives on plain numeric lists (e.g. "milk 2 / eggs
 * 12 / bread 4"), we require the block to contain at least one explicit
 * "$" prefix OR a total-keyword row. This is a precision guard suggested
 * by code review.
 */
function parseLedgerBlock(block: string): LedgerRow[] | null {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  const rows: LedgerRow[] = [];
  for (const line of lines) {
    // "label   -$90" / "label   $90.00" / "label   -$90.00"
    const m = line.match(
      /^([A-Za-z][A-Za-z0-9'\-/&. ()]*?)\s+(-?)(\$?)\s?(-?)(\d{1,5}(?:\.\d{1,2})?)\s*$/,
    );
    if (!m) return null; // any non-row line invalidates the block
    const label = m[1].trim();
    const isNegative = !!(m[2] || m[4]);
    const hadDollar = m[3] === "$";
    const amt = parseFloat(m[5]);
    if (!isFinite(amt)) return null;
    const isTotal = /\b(total|sum|net|spent|final|balance|buffer|left over)\b/i.test(
      label,
    );
    rows.push({ label, amt, isNegative, isTotal, hadDollar });
  }

  // Precision guard: at least one explicit "$" prefix OR a total-keyword
  // row. Prevents random 3+ line numeric lists from being mis-detected.
  const hasDollar = rows.some((r) => r.hadDollar);
  const hasTotal = rows.some((r) => r.isTotal);
  if (!hasDollar && !hasTotal) return null;

  return rows;
}

/**
 * Inline expense ledger that lives *inside* a regular Tilly text bubble
 * (e.g. the breakdown in "what's killing my budget?"). Each row gets a
 * subtle chip-tinted background + tabular-nums right-aligned amount,
 * matching the design backup's BTLedgerRow / Quick Math styling. The
 * total row (when present) bolds and uses the ink color.
 */
function InlineLedger({ rows }: { rows: LedgerRow[] }) {
  const { t } = useBT();
  return (
    <View style={{ gap: 2, marginVertical: 2 }}>
      {rows.map((r, i) => {
        // Color: negatives in t.bad, positives in t.good, the running
        // total/buffer line in ink. isTotal is style-only emphasis and
        // does NOT override the row's actual sign.
        const amtColor = r.isNegative ? t.bad : r.isTotal ? t.ink : t.good;
        return (
          <View
            key={i}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "baseline",
              backgroundColor: t.chip,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                fontFamily: BTFonts.mono,
                fontSize: 12,
                color: r.isTotal ? t.ink : t.inkSoft,
                fontWeight: r.isTotal ? "700" : "400",
                letterSpacing: 0.4,
                flexShrink: 1,
                paddingRight: 12,
              }}
              numberOfLines={1}
            >
              {r.label}
            </Text>
            <Text
              style={{
                fontFamily: BTFonts.mono,
                fontSize: 12,
                color: amtColor,
                fontWeight: r.isTotal ? "700" : "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {r.isNegative ? "−" : ""}${r.amt.toFixed(2)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Render Tilly's reply with the small slice of markdown the persona uses:
 *   - `**bold**` → accent serif italic span (acts as a heading-of-sorts)
 *   - `*phrase*` → accent serif italic span
 *   - triple-backtick fences are stripped (we discourage them in the
 *     persona prompt but the model occasionally uses them anyway)
 *   - `---` standalone lines render as a hairline divider
 *   - paragraph breaks come from \n\n
 *   - a paragraph that is entirely "label   $amount" rows (3+) renders
 *     as an inline expense ledger (mono, tabular, chip background) so
 *     breakdown replies match the design backup.
 *
 * Both `**bold**` and `*italic*` collapse to the same accent-italic style
 * because the spec only has one emphasis register; we just want neither
 * pair of asterisks to leak through as literals.
 */
function RichTillyText({ body, color }: { body: string; color: string }) {
  const { t } = useBT();
  // Strip ``` fences entirely (keep the inner text).
  const cleaned = body.replace(/```[a-z]*\n?/gi, "").replace(/\n```/g, "");
  const blocks = cleaned.split(/\n\n+/);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, blockIdx) => {
        if (block.trim() === "---" || block.trim() === "—") {
          return (
            <View
              key={blockIdx}
              style={{ height: 1, backgroundColor: t.rule, marginVertical: 4 }}
            />
          );
        }
        const ledger = parseLedgerBlock(block);
        if (ledger) {
          return <InlineLedger key={blockIdx} rows={ledger} />;
        }
        // Match **bold** first, then *italic*. Both collapse to the same
        // accent-italic span so we don't leak literal asterisks either way.
        const segments = block.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter(Boolean);
        return (
          <Text
            key={blockIdx}
            style={{
              color,
              fontFamily: BTFonts.sans,
              fontSize: 14,
              lineHeight: 21,
            }}
          >
            {segments.map((seg, segIdx) => {
              const isBold = seg.startsWith("**") && seg.endsWith("**") && seg.length > 4;
              const isItalic = !isBold && seg.startsWith("*") && seg.endsWith("*") && seg.length > 2;
              if (isBold || isItalic) {
                const inner = isBold ? seg.slice(2, -2) : seg.slice(1, -1);
                return (
                  <Text
                    key={segIdx}
                    style={{
                      fontFamily: BTFonts.serifItalic,
                      color: t.accent,
                      fontSize: 15,
                    }}
                  >
                    {inner}
                  </Text>
                );
              }
              return <Text key={segIdx}>{seg}</Text>;
            })}
          </Text>
        );
      })}
    </View>
  );
}

function TypingBubble() {
  const { t } = useBT();
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 420,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
      <Tilly t={t} size={28} state="think" breathing={false} />
      <View
        style={{
          flexDirection: "row",
          gap: 4,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: t.surface,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: t.rule,
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: t.inkMute,
              transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            }}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Affordability-card CTAs — Tilly may have populated up to two proposals
 * on the analysis (S9 scoutProposal + S11 waitProposal). Show whichever
 * are set. Tapping one calls back to the parent which kicks off the
 * matching mutation and locally hides the strip so the user isn't
 * pestered. The dismiss is non-persistent (per render, not a saved
 * preference).
 */
function ProposalCTAs({
  scoutProposal,
  waitProposal,
  onScout,
  onAskWait,
  scouting,
  askingWait,
}: {
  scoutProposal: import("../api/types").ScoutProposal | null;
  waitProposal: import("../api/types").WaitProposal | null;
  onScout: () => void;
  onAskWait: () => void;
  scouting: boolean;
  askingWait: boolean;
}) {
  const { t } = useBT();
  const [dismissed, setDismissed] = useState(false);
  const [tapped, setTapped] = useState(false);
  if (dismissed || tapped) return null;
  if (!scoutProposal && !waitProposal) return null;
  // Reason text: prefer waitProposal's because it's more actionable
  // ("Levi's go on sale every Black Friday, want me to check?").
  // If both are present, show the wait reason — they share a query
  // shape so the scout reason would feel redundant.
  const reason = waitProposal?.reason ?? scoutProposal?.reason ?? "";
  return (
    <View
      style={{
        marginTop: 4,
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.rule,
      }}
    >
      {reason ? (
        <Text
          style={{
            fontFamily: BTFonts.serifItalic,
            color: t.accent,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {reason}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {scoutProposal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find me cheaper options"
            disabled={scouting || askingWait}
            onPress={() => {
              setTapped(true);
              onScout();
            }}
            style={{
              flex: 1,
              minWidth: 140,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: t.accent,
              alignItems: "center",
              opacity: scouting || askingWait ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: BTFonts.sans,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              Find cheaper options
            </Text>
          </Pressable>
        ) : null}
        {waitProposal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Should I wait for a sale?"
            disabled={scouting || askingWait}
            onPress={() => {
              setTapped(true);
              onAskWait();
            }}
            style={{
              flex: 1,
              minWidth: 120,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.accent,
              alignItems: "center",
              opacity: scouting || askingWait ? 0.6 : 1,
              backgroundColor: scoutProposal ? "transparent" : t.accent,
            }}
          >
            <Text
              style={{
                color: scoutProposal ? t.accent : "#fff",
                fontFamily: BTFonts.sans,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              Should I wait?
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now"
          onPress={() => setDismissed(true)}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
          }}
        >
          <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Scout result bubble — shows three states:
 *   - queued / running: "Scouting…" with a spinner and the query echoed
 *   - done: 1-3 option rows with source chip, title, price, "open" link,
 *     plus the LLM-written summary line at the top
 *   - failed: short apologetic note with the errorText
 *
 * This is purely a renderer; the bubble updates automatically because
 * useTilly() refetches /api/tilly/chat/history every 2.5s while a
 * scout is mid-flight.
 */
function ScoutBubble({
  m,
}: {
  m: Extract<Msg, { kind: "scout" }>;
}) {
  const { t } = useBT();
  if (m.status === "queued" || m.status === "running") {
    return (
      <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 8 }}>
        <BTLabel color={t.inkMute} size={10}>
          Tilly is scouting
        </BTLabel>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator size="small" color={t.accent} />
          <Text
            style={{
              flex: 1,
              fontFamily: BTFonts.serifItalic,
              fontSize: 14,
              color: t.ink,
            }}
            numberOfLines={2}
          >
            Looking for "{m.query}"
            {m.location ? ` near ${m.location}` : ""}…
          </Text>
        </View>
      </BTCard>
    );
  }
  if (m.status === "failed") {
    return (
      <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 6 }}>
        <BTLabel color={t.inkMute} size={10}>
          No live results
        </BTLabel>
        <Text
          style={{
            fontFamily: BTFonts.serif,
            fontSize: 14,
            color: t.ink,
          }}
        >
          I couldn't find anything live for "{m.query}" right now. Want me to try again later?
        </Text>
      </BTCard>
    );
  }
  // status === "done"
  return (
    <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 10 }}>
      <BTLabel color={t.inkMute} size={10}>
        Found {m.options.length} option{m.options.length === 1 ? "" : "s"}
      </BTLabel>
      {m.summary ? (
        <Text
          style={{
            fontFamily: BTFonts.serif,
            fontSize: 15,
            lineHeight: 21,
            color: t.ink,
          }}
        >
          {m.summary}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {m.options.map((opt, i) => (
          <Pressable
            key={i}
            accessibilityRole="link"
            accessibilityLabel={`Open ${opt.title}`}
            onPress={() => Linking.openURL(opt.url).catch(() => {})}
            style={{
              padding: 10,
              borderRadius: 10,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.rule,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text
                style={{
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  color: t.accent,
                }}
                numberOfLines={1}
              >
                {opt.source}
                {opt.condition ? ` · ${opt.condition}` : ""}
              </Text>
              {opt.price ? (
                <Text
                  style={{
                    fontFamily: BTFonts.mono,
                    fontSize: 11,
                    fontWeight: "700",
                    color: t.good,
                  }}
                >
                  {opt.price}
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 15,
                fontWeight: "600",
                color: t.ink,
                lineHeight: 21,
                marginTop: 2,
              }}
              numberOfLines={2}
            >
              {opt.title}
            </Text>
            <Text
              style={{
                fontFamily: BTFonts.serif,
                fontSize: 14,
                color: t.inkSoft,
                lineHeight: 20,
              }}
              numberOfLines={3}
            >
              {opt.why}
            </Text>
          </Pressable>
        ))}
      </View>
    </BTCard>
  );
}

/**
 * Wait/seasonal advice bubble — S11. Shows three states:
 *   - queued / running: "Looking up sale history…"
 *   - done: verdict (wait or buy), date, expected saving, 1-3 sources
 *   - failed: graceful note
 *
 * The bubble updates automatically because useTilly() refetches the
 * chat history every 2.5s while the underlying job is queued/running.
 */
function WaitBubble({ m }: { m: Extract<Msg, { kind: "wait" }> }) {
  const { t } = useBT();
  if (m.status === "queued" || m.status === "running") {
    return (
      <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 8 }}>
        <BTLabel color={t.inkMute} size={10}>
          Should you wait?
        </BTLabel>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <ActivityIndicator size="small" color={t.accent} />
          <Text
            style={{
              flex: 1,
              fontFamily: BTFonts.serifItalic,
              fontSize: 14,
              color: t.ink,
            }}
            numberOfLines={2}
          >
            Looking at sale history for "{m.query}"…
          </Text>
        </View>
      </BTCard>
    );
  }
  if (m.status === "failed") {
    return (
      <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 6 }}>
        <BTLabel color={t.inkMute} size={10}>
          Couldn't tell
        </BTLabel>
        <Text style={{ fontFamily: BTFonts.serif, fontSize: 14, color: t.ink }}>
          I couldn't find a clear sale pattern for "{m.query}" right now.
        </Text>
      </BTCard>
    );
  }
  // status === "done"
  const verdictColor = m.shouldWait ? t.good : t.inkMute;
  const verdictLabel = m.shouldWait
    ? "Wait — likely cheaper soon"
    : "Buy now — no clear sale window";
  return (
    <BTCard t={t} alt padding={14} style={{ flex: 1, gap: 10 }}>
      <BTLabel color={verdictColor} size={10}>
        {verdictLabel}
      </BTLabel>
      {m.summary ? (
        <Text
          style={{
            fontFamily: BTFonts.serif,
            fontSize: 15,
            lineHeight: 21,
            color: t.ink,
          }}
        >
          {m.summary}
        </Text>
      ) : null}
      {m.shouldWait ? (
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          {m.waitUntil ? (
            <View>
              <Text
                style={{
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  color: t.inkSoft,
                }}
              >
                Until
              </Text>
              <Text
                style={{
                  fontFamily: BTFonts.serif,
                  fontSize: 14,
                  color: t.ink,
                }}
              >
                {m.waitUntil}
              </Text>
            </View>
          ) : null}
          {m.expectedSaving ? (
            <View>
              <Text
                style={{
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  color: t.inkSoft,
                }}
              >
                Likely save
              </Text>
              <Text
                style={{
                  fontFamily: BTFonts.serif,
                  fontSize: 14,
                  fontWeight: "700",
                  color: t.good,
                }}
              >
                {m.expectedSaving}
              </Text>
            </View>
          ) : null}
          {m.confidence ? (
            <View>
              <Text
                style={{
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  color: t.inkSoft,
                }}
              >
                Confidence
              </Text>
              <Text style={{ fontFamily: BTFonts.serif, fontSize: 14, color: t.ink }}>
                {m.confidence}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {m.sources.length ? (
        <View style={{ gap: 6 }}>
          <BTLabel color={t.inkMute} size={9}>
            Why
          </BTLabel>
          {m.sources.slice(0, 3).map((s, i) => (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(s.url).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`Open ${s.source}`}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.rule,
                gap: 2,
              }}
            >
              <Text
                style={{
                  fontFamily: BTFonts.mono,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  color: t.accent,
                }}
                numberOfLines={1}
              >
                {s.source}
              </Text>
              <Text
                style={{
                  fontFamily: BTFonts.serif,
                  fontSize: 14,
                  color: t.ink,
                  lineHeight: 20,
                  marginTop: 4,
                }}
                numberOfLines={4}
              >
                {s.evidence}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </BTCard>
  );
}

/**
 * ReminderConfirmationChip — small "✓ Saved for Friday 9 AM" line under
 * the Tilly bubble that just earned a reminder. Bound to the specific
 * message id via useTilly's confirmedReminders map. Renders nothing on
 * history reload — the source of truth for "what's pending" is the
 * Today tab Up Next card and the You tab Your Reminders screen.
 */
function ReminderConfirmationChip({
  reminder,
}: {
  reminder: { label: string; fireAt: string };
}) {
  const { t } = useBT();
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diffH = (d.getTime() - now) / (1000 * 60 * 60);
    const time = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    if (diffH < 24) return `today ${time}`;
    if (diffH < 48) return `tomorrow ${time}`;
    return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
  };
  return (
    <View
      style={{
        marginTop: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: t.accentSoft ?? t.surface,
        borderWidth: 1,
        borderColor: t.rule,
      }}
    >
      <Text
        style={{
          color: t.good,
          fontFamily: BTFonts.sans,
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        ✓
      </Text>
      <Text
        style={{
          color: t.ink,
          fontFamily: BTFonts.serifItalic,
          fontSize: 12,
          lineHeight: 16,
        }}
        numberOfLines={2}
      >
        Saved for {fmt(reminder.fireAt)}
      </Text>
    </View>
  );
}
