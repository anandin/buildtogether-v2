/**
 * BTProfile — Tilly's relationship surface. Spec §4.6 + §5.4.
 *
 * The most differentiated screen. The tone tuner has live preview; the notes
 * timeline is Tilly's commitment to remember. Memory · forever — your choice
 * is the row that matters.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BT_DATA } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTLabel, BTRule, BTSerif } from "../atoms";
import { BT_PULSE_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BT_TONES, type BTToneKey } from "../tones";

export function BTProfile() {
  const { t, tone, setTone } = useBT();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 26 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero "You + Tilly" */}
      <View style={{ alignItems: "center", gap: 14, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          {/* User initial avatar */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: t.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: t.accent,
                fontFamily: BTFonts.serif,
                fontSize: 28,
                fontWeight: "500",
              }}
            >
              {BT_DATA.user.name[0]}
            </Text>
          </View>
          <Text style={{ color: t.inkMute, fontSize: 18 }}>+</Text>
          <Tilly t={t} size={64} halo />
        </View>
        <BTSerif size={26} color={t.ink} weight="500">
          {BT_DATA.user.name} & Tilly
        </BTSerif>
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 10,
            letterSpacing: 1.3,
            textTransform: "uppercase",
          }}
        >
          {BT_DATA.daysWithTilly} days · {BT_DATA.studentRole}
        </Text>
      </View>

      {/* Tone tuner */}
      <View style={{ gap: 12 }}>
        <BTLabel color={t.inkMute}>How Tilly talks to you</BTLabel>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: t.surface,
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          {(["sibling", "coach", "quiet"] as BTToneKey[]).map((k) => {
            const active = tone.key === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTone(k)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: active ? t.ink : "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? t.surface : t.inkSoft,
                    fontFamily: BTFonts.sans,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {BT_TONES[k].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {/* Live preview card */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 14,
            backgroundColor: t.surfaceAlt,
            borderRadius: 16,
          }}
        >
          <Tilly t={t} size={32} breathing={false} />
          <Text
            style={{
              flex: 1,
              color: t.ink,
              fontFamily: BTFonts.serif,
              fontSize: 15,
              lineHeight: 22,
              fontStyle: "italic",
            }}
          >
            {tone.sample}
          </Text>
        </View>
      </View>

      {/* What I've learned about you */}
      <View style={{ gap: 14 }}>
        <BTLabel color={t.inkMute}>What I've learned</BTLabel>
        <BTSerif size={24} color={t.ink} weight="500">
          <Text style={{ fontStyle: "italic", fontFamily: BTFonts.serif, color: t.accent }}>
            Tilly's notes
          </Text>
          , in her own words
        </BTSerif>
        <Timeline t={t} />
      </View>

      {/* Trusted people */}
      <View style={{ gap: 10 }}>
        <BTLabel color={t.inkMute}>Trusted people</BTLabel>
        {BT_DATA.trusted.map((p) => {
          const c1 =
            p.hue === "accent" ? t.accent : p.hue === "accent2" ? t.accent2 : t.warn;
          const c2 = t.surface;
          return (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: 16,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.rule,
              }}
            >
              <LinearGradient
                colors={[c1, c2]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontWeight: "600" }}>
                  {p.name[0]}
                </Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
                  {p.name}
                </Text>
                <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 12, marginTop: 2 }}>
                  {p.scope}
                </Text>
              </View>
            </View>
          );
        })}
        <Pressable
          style={{
            padding: 14,
            borderRadius: 16,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.rule,
            alignItems: "center",
          }}
        >
          <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serif, fontSize: 14, fontStyle: "italic" }}>
            + Invite someone you trust
          </Text>
        </Pressable>
      </View>

      {/* Quiet settings */}
      <View style={{ gap: 8 }}>
        <BTLabel color={t.inkMute}>Quiet settings</BTLabel>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.rule,
            overflow: "hidden",
          }}
        >
          {BT_DATA.quietSettings.map((s, i) => {
            const emphasize = "emphasize" in s && s.emphasize;
            return (
              <View key={s.id}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 14,
                  }}
                >
                  <Text
                    style={{
                      color: t.ink,
                      fontFamily: BTFonts.sans,
                      fontWeight: emphasize ? "700" : "500",
                      fontSize: 13,
                    }}
                  >
                    {s.label}
                  </Text>
                  <Text
                    style={{
                      color: emphasize ? t.accent : t.inkSoft,
                      fontFamily: emphasize ? BTFonts.serif : BTFonts.mono,
                      fontSize: emphasize ? 14 : 11,
                      fontStyle: emphasize ? "italic" : "normal",
                      letterSpacing: emphasize ? 0 : 0.8,
                      textTransform: emphasize ? "none" : "uppercase",
                    }}
                  >
                    {s.value}
                  </Text>
                </View>
                {i < BT_DATA.quietSettings.length - 1 ? <BTRule color={t.rule} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function Timeline({ t }: { t: BTTheme }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ gap: 0 }}>
      {BT_DATA.memory.map((m, i) => {
        const last = i === BT_DATA.memory.length - 1;
        return (
          <View key={m.id} style={{ flexDirection: "row", gap: 14 }}>
            {/* Rail */}
            <View style={{ width: 24, alignItems: "center" }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: m.recent ? t.accent : t.surface,
                  borderWidth: 2,
                  borderColor: m.recent ? t.accent : t.rule,
                  marginTop: 4,
                }}
              />
              {m.recent ? (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: -2,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: t.accent,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] }),
                  }}
                />
              ) : null}
              {!last ? (
                <View style={{ flex: 1, width: 1.5, backgroundColor: t.rule, marginTop: 4 }} />
              ) : null}
            </View>
            {/* Body */}
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18, gap: 6 }}>
              <Text
                style={{
                  color: m.recent ? t.accent : t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 10,
                  letterSpacing: 1.3,
                  textTransform: "uppercase",
                  fontWeight: "700",
                }}
              >
                {m.date}
              </Text>
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.serif,
                  fontSize: 16,
                  lineHeight: 22,
                  fontStyle: "italic",
                }}
              >
                "{m.body}"
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
