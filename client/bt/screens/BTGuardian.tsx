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
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BT_CHAT_SEED, BT_SUGGESTED_PROMPTS } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTCard, BTLabel, BTRule, BTSerif } from "../atoms";
import { BTFonts } from "../theme";

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
    };

export function BTGuardian() {
  const { t } = useBT();
  const [messages, setMessages] = useState<Msg[]>(BT_CHAT_SEED as unknown as Msg[]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // auto-scroll on new content
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, thinking]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const u: Msg = { id: `u${Date.now()}`, role: "user", kind: "text", body: text };
    setMessages((prev) => [...prev, u]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      const reply: Msg = {
        id: `t${Date.now()}`,
        role: "tilly",
        kind: "text",
        body:
          "Let me think on that — I want to look at your buffer before I answer. Give me a sec.",
      };
      setMessages((prev) => [...prev, reply]);
      setThinking(false);
    }, 1100);
  };

  const tillyState: "idle" | "think" = thinking ? "think" : "idle";

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
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
            calm, wise, plainspoken
          </Text>
        </View>
        <Pressable
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          <BTLabel color={t.inkSoft} size={10}>memory</BTLabel>
        </Pressable>
      </View>

      <BTRule color={t.rule} />

      {/* Chat scroll */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: 24 }}
      >
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {thinking ? <TypingBubble /> : null}
      </ScrollView>

      {/* Suggested prompts */}
      {!thinking ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingVertical: 8 }}
        >
          {BT_SUGGESTED_PROMPTS.map((p) => (
            <Pressable
              key={p}
              onPress={() => send(p)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.rule,
              }}
            >
              <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13 }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
    </View>
  );
}

function Bubble({ m }: { m: Msg }) {
  const { t } = useBT();

  if (m.role === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
        <View
          style={{
            backgroundColor: t.ink,
            borderRadius: 18,
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
        </BTCard>
      </View>
    );
  }

  // tilly text
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", maxWidth: "82%" }}>
      <Tilly t={t} size={28} breathing={false} />
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: t.rule,
        }}
      >
        <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontSize: 14 }}>
          {(m as { body: string }).body}
        </Text>
      </View>
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
