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
import { useUser } from "../hooks/useUser";
import { MemoryInspector } from "../MemoryInspector";
import type { TillyMessage } from "../api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { btApi } from "../api/client";

type Msg =
  | { id: string; role: "user"; kind: "text"; body: string }
  | { id: string; role: "tilly"; kind: "text"; body: string }
  | { id: string; role: "tilly"; kind: "typing" }
  | {
      id: string;
      role: "tilly";
      kind: "analysis";
      title: string;
      rows: { label: string; amt: number; sign: "+" | "-" | "=" }[];
      note: string;
      scoutProposal?: import("../api/types").ScoutProposal | null;
      waitProposal?: import("../api/types").WaitProposal | null;
    }
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
  return { id: m.id, role: "tilly", kind: "text", body: m.body };
}

export function BTGuardian() {
  const { t, tone } = useBT();
  const { user } = useUser();
  const tilly = useTillyChat();
  const [draft, setDraft] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
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
  const messages: Msg[] =
    tilly.messages.length > 0
      ? tilly.messages.map(toLocal)
      : firstTimeMessages;

  const thinking = tilly.isThinking;

  useEffect(() => {
    // auto-scroll on new content
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, thinking]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft("");
    tilly.send(trimmed);
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
      <MemoryInspector visible={memoryOpen} onClose={() => setMemoryOpen(false)} />

      <RemindersStrip />

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
}: {
  m: Msg;
  onScout: (query: string) => void;
  onAskWait: (query: string) => void;
  scouting: boolean;
  askingWait: boolean;
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
      <View
        style={{
          flexShrink: 1,
          backgroundColor: t.surface,
          // Asymmetric: round except bottom-left, mirroring the user bubble's
          // bottom-right tail. Anchors the bubble to its avatar.
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
    </View>
  );
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

/**
 * Render Tilly's reply with the small slice of markdown the persona uses:
 *   - `**bold**` → accent serif italic span (acts as a heading-of-sorts)
 *   - `*phrase*` → accent serif italic span
 *   - triple-backtick fences are stripped (we discourage them in the
 *     persona prompt but the model occasionally uses them anyway)
 *   - `---` standalone lines render as a hairline divider
 *   - paragraph breaks come from \n\n
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
    <View style={{ gap: 6 }}>
      {blocks.map((block, blockIdx) => {
        if (block.trim() === "---" || block.trim() === "—") {
          return (
            <View
              key={blockIdx}
              style={{ height: 1, backgroundColor: t.rule, marginVertical: 4 }}
            />
          );
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
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
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
                fontSize: 13,
                color: t.ink,
              }}
              numberOfLines={2}
            >
              {opt.title}
            </Text>
            <Text
              style={{
                fontFamily: BTFonts.serifItalic,
                fontSize: 12,
                color: t.inkSoft,
              }}
              numberOfLines={2}
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
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
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
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
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
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
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
                  fontSize: 9,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: t.accent,
                }}
                numberOfLines={1}
              >
                {s.source}
              </Text>
              <Text
                style={{
                  fontFamily: BTFonts.serifItalic,
                  fontSize: 12,
                  color: t.inkSoft,
                }}
                numberOfLines={3}
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
 * RemindersStrip — surfaces reminders Tilly has actually scheduled, so
 * the "I'll ping you" promise is visible + cancellable. Hides itself
 * when there are no scheduled reminders so it doesn't add noise to the
 * empty-state chat.
 */
function RemindersStrip() {
  const { t } = useBT();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["/api/tilly/reminders"],
    queryFn: btApi.reminders,
    staleTime: 30_000,
  });
  const cancel = useMutation({
    mutationFn: btApi.cancelReminder,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["/api/tilly/reminders"] }),
  });
  const scheduled = (list.data?.reminders ?? []).filter(
    (r) => r.status === "scheduled",
  );
  if (scheduled.length === 0) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const now = Date.now();
    const diffH = (d.getTime() - now) / (1000 * 60 * 60);
    if (diffH < 24)
      return `today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (diffH < 48) return "tomorrow";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };
  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
      <BTLabel color={t.inkMute} size={9}>
        Tilly will ping you
      </BTLabel>
      <View style={{ marginTop: 8, gap: 6 }}>
        {scheduled.slice(0, 3).map((r) => (
          <View
            key={r.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              padding: 10,
              borderRadius: 10,
              backgroundColor: t.surfaceAlt,
            }}
          >
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                width: 78,
              }}
            >
              {fmt(r.fireAt)}
            </Text>
            <Text
              style={{
                color: t.ink,
                fontFamily: BTFonts.serifItalic,
                fontSize: 13,
                lineHeight: 17,
                flex: 1,
              }}
              numberOfLines={2}
            >
              {r.label}
            </Text>
            <Pressable
              onPress={() => cancel.mutate(r.id)}
              disabled={cancel.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Cancel reminder ${r.label}`}
              style={{ padding: 4 }}
            >
              <Text style={{ color: t.inkMute, fontSize: 16 }}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
