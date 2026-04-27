/**
 * BTGuardian — Tilly chat. Translated 1:1 from `screens.jsx::BTGuardian`.
 *
 * Critical features:
 *   - Header: Tilly 36 (state changes to `think` while processing) + serif
 *     "Tilly" 22px + voice descriptor in mono caps + "memory" pill (top-right)
 *   - **Time stamp centered** at top of chat (BT_TIMES[time].stamp)
 *   - Initial messages: tone sample → user $90 ticket → analysis card
 *   - **Quick-math analysis card**: mono ledger (right-aligned amounts, bad
 *     in red, dotted line, buffer in green/good), then serif body with
 *     Tilly's call + ceiling action
 *   - **Suggested prompts** (4) shown as full-width pill cards
 *   - Composer: bg-colored input + 38px ink send button
 *   - Bubble corners: user `14 14 4 14`, tilly `14 14 14 4` (round except
 *     the corner pointing at the speaker)
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import { BT_TIMES } from "../tones";
import { BTFonts, type BTTheme } from "../theme";
import { BTLabel } from "../atoms";

type Msg =
  | { id: string; from: "me"; kind: "text"; text: string; when: string }
  | { id: string; from: "tilly"; kind: "text"; text: string; when: string }
  | { id: string; from: "tilly"; kind: "typing" }
  | { id: string; from: "tilly"; kind: "analysis" };

export function BTGuardian() {
  const { t, tone, time } = useBT();
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: "m1", from: "tilly", kind: "text", text: tone.sample, when: "7:42 AM" },
    { id: "m2", from: "me", kind: "text", text: "can I afford a $90 concert ticket fri?", when: "7:43 AM" },
    { id: "m3", from: "tilly", kind: "analysis" },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [msgs.length, thinking]);

  const send = () => {
    if (!draft.trim()) return;
    const id = `u${Date.now()}`;
    setMsgs((m) => [...m, { id, from: "me", kind: "text", text: draft, when: "now" }]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMsgs((m) => [
        ...m,
        {
          id: `t${Date.now()}`,
          from: "tilly",
          kind: "text",
          text:
            "Honestly? Yes — but only because you skipped takeout twice this week. Want me to move it from your spending money, not from Barcelona?",
          when: "now",
        },
      ]);
    }, 1100);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: t.rule,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Tilly t={t} size={36} state={thinking ? "think" : "idle"} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 22,
              color: t.ink,
              lineHeight: 24,
            }}
          >
            Tilly
          </Text>
          <BTLabel color={t.inkSoft}>{tone.voice}</BTLabel>
        </View>
        <Pressable
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 0.9,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            memory
          </Text>
        </Pressable>
      </View>

      {/* Chat */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}
      >
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <BTLabel color={t.inkMute}>{BT_TIMES[time].stamp}</BTLabel>
        </View>
        {msgs.map((m) => (
          <Bubble key={m.id} m={m} t={t} />
        ))}
        {thinking ? <TypingBubble t={t} /> : null}

        {!thinking ? (
          <View style={{ marginTop: 14, gap: 6 }}>
            <BTLabel color={t.inkMute} style={{ marginBottom: 4 }}>
              Try asking
            </BTLabel>
            {BT_SUGGESTED_PROMPTS.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => setDraft(s)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: t.rule,
                }}
              >
                <Text
                  style={{
                    color: t.ink,
                    fontFamily: BTFonts.sans,
                    fontSize: 13,
                  }}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Composer */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: t.rule,
          padding: 12,
          paddingBottom: 22,
          flexDirection: "row",
          gap: 8,
          backgroundColor: t.surface,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="ask Tilly anything…"
          placeholderTextColor={t.inkMute}
          onSubmitEditing={send}
          returnKeyType="send"
          style={{
            flex: 1,
            backgroundColor: t.bg,
            borderWidth: 1,
            borderColor: t.rule,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontFamily: BTFonts.sans,
            fontSize: 13,
            color: t.ink,
          }}
        />
        <Pressable
          onPress={send}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: t.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: t.bg, fontSize: 16, fontWeight: "700" }}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ m, t }: { m: Msg; t: BTTheme }) {
  if (m.from === "me" && m.kind === "text") {
    return (
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 }}>
        <View
          style={{
            maxWidth: "78%",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            borderBottomRightRadius: 4,
            backgroundColor: t.ink,
          }}
        >
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {m.text}
          </Text>
        </View>
      </View>
    );
  }

  if (m.from === "tilly" && m.kind === "analysis") {
    return (
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
        <View style={{ marginTop: 4 }}>
          <Tilly t={t} size={26} state="idle" />
        </View>
        <View
          style={{
            flex: 1,
            maxWidth: "88%",
            padding: 14,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
            borderRadius: 14,
            borderBottomLeftRadius: 4,
          }}
        >
          <BTLabel color={t.inkSoft}>Quick math</BTLabel>
          <View style={{ marginTop: 10, gap: 4 }}>
            <LedgerRow label="Available Fri after rent" amt="$412.58" t={t} />
            <LedgerRow label="Concert ticket" amt="−$90.00" t={t} amtColor={t.bad} />
            <LedgerRow label="Weekend food (est)" amt="−$60.00" t={t} amtColor={t.bad} />
            <View style={{ height: 1, backgroundColor: t.rule, marginVertical: 6 }} />
            <LedgerRow label="Buffer left" amt="$262.58" t={t} amtColor={t.good} bold />
          </View>
          <Text
            style={{
              marginTop: 10,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              color: t.ink,
              lineHeight: 19,
            }}
          >
            You can do it. The risk isn't the ticket — it's the post-concert dinner. Want me to set
            a $30 ceiling on Friday night food?
          </Text>
        </View>
      </View>
    );
  }

  // tilly text
  if (m.from === "tilly" && m.kind === "text") {
    return (
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
        <Tilly t={t} size={26} state="idle" />
        <View
          style={{
            maxWidth: "78%",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 14,
            borderBottomLeftRadius: 4,
            backgroundColor: t.surface,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <Text
            style={{
              color: t.ink,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {m.text}
          </Text>
        </View>
      </View>
    );
  }

  return null;
}

function LedgerRow({
  label,
  amt,
  t,
  amtColor,
  bold,
}: {
  label: string;
  amt: string;
  t: BTTheme;
  amtColor?: string;
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text
        style={{
          fontFamily: BTFonts.mono,
          fontSize: 11,
          color: t.ink,
          fontWeight: bold ? "700" : "400",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: BTFonts.mono,
          fontSize: 11,
          color: amtColor ?? t.ink,
          fontWeight: bold ? "700" : "400",
          fontVariant: ["tabular-nums"],
        }}
      >
        {amt}
      </Text>
    </View>
  );
}

function TypingBubble({ t }: { t: BTTheme }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, {
            toValue: 1,
            duration: 360,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d, {
            toValue: 0,
            duration: 360,
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
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "flex-end" }}>
      <Tilly t={t} size={26} state="think" />
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 14,
          borderBottomLeftRadius: 4,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.rule,
          flexDirection: "row",
          gap: 4,
          alignItems: "center",
        }}
      >
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.inkSoft,
              transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            }}
          />
        ))}
      </View>
    </View>
  );
}
