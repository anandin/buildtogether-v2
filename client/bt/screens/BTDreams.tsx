/**
 * BTDreams — goal portraits. Translated 1:1 from `screens.jsx::BTDreams`.
 *
 * Critical features:
 *   - **Header** — "What you're building" mono caps + 32px serif headline:
 *     italic accent "$2,462" set aside this year. About $4.20 a day. Sub
 *     in inkSoft: "Tilly auto-moves it after every paycheck — you don't
 *     have to remember."
 *   - **Three portrait cards** per BT_DREAM_VISUALS:
 *     - 132px gradient header (135deg, dream-specific colors). Diagonal
 *       repeating stripe texture (45deg, 12px gap, 8% opacity).
 *     - **Oversized glyph** — bottom-right, fontSize 160 in serif at
 *       18% white opacity (✺ for Barcelona, ◇ for laptop, ◉ for cushion)
 *     - Loc label (mono caps 0.14em) + 32px serif label
 *     - **Shimmer overlay** if `pct` is within 8% of a milestone
 *   - **Body** — $saved of $target + percentage chip (chip turns accent if
 *     just-crossed milestone), milestone track with 4 dots at 25/50/75/100,
 *     reached dots filled in `grad[1]`, just-hit dot has 6px ring shadow +
 *     btPulse animation, footer with auto-deposit + due date.
 *   - **Tilly nudge** for first dream (Barcelona): "Skip two takeout meals
 *     a week and Barcelona arrives Feb 18 instead of March 5."
 *   - **Just crossed banner** for second dream when `justCrossed`
 *   - **+ Name a new dream** — dashed-border tile in serif italic
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BT_DATA, BT_DREAM_VISUALS, type BTDream } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BT_PULSE_DURATION_MS, BT_SHIMMER_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BTLabel, BTNum, BTSerif } from "../atoms";

const MILESTONES = [25, 50, 75, 100];

export function BTDreams() {
  const { t } = useBT();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 14 }}>
        <BTLabel color={t.inkMute} style={{ marginBottom: 10 }}>
          What you're building
        </BTLabel>
        <BTSerif size={32} color={t.ink} style={{ lineHeight: 38, marginBottom: 10 }}>
          <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
            $2,462
          </Text>{" "}
          set aside this year. About $4.20 a day.
        </BTSerif>
        <Text
          style={{
            fontFamily: BTFonts.sans,
            fontSize: 13,
            color: t.inkSoft,
            lineHeight: 19,
          }}
        >
          Tilly auto-moves it after every paycheck — you don't have to remember.
        </Text>
      </View>

      {/* Portrait cards */}
      <View style={{ paddingHorizontal: 22, paddingTop: 8, gap: 14 }}>
        {BT_DATA.dreams.map((d, i) => (
          <DreamPortrait key={d.id} d={d} t={t} index={i} />
        ))}

        <Pressable
          style={{
            marginTop: 4,
            padding: 20,
            borderRadius: 18,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.ink + "33",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 18,
              color: t.inkSoft,
            }}
          >
            + Name a new dream
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function DreamPortrait({ d, t, index }: { d: BTDream; t: BTTheme; index: number }) {
  const v = BT_DREAM_VISUALS[d.id];
  const pct = Math.round((d.saved / d.target) * 100);
  const justCrossed = MILESTONES.find((m) => pct >= m && pct < m + 8) ?? null;

  // Shimmer animation when just crossed
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!justCrossed) return;
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: BT_SHIMMER_DURATION_MS - 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [justCrossed, slide]);
  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [-160, 360] });

  // Pulse for just-hit milestone dot
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.in(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      style={{
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.ink + "10",
      }}
    >
      {/* Portrait header */}
      <View style={{ height: 132, position: "relative", overflow: "hidden" }}>
        <LinearGradient
          colors={v.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Diagonal stripe texture */}
        <DiagonalStripes color="#fff" opacity={0.08} />
        {/* Big glyph */}
        <Text
          style={{
            position: "absolute",
            right: -10,
            bottom: -28,
            fontSize: 160,
            lineHeight: 160,
            color: "#fff",
            opacity: 0.18,
            fontFamily: BTFonts.serif,
          }}
        >
          {v.glyph}
        </Text>
        {/* Shimmer */}
        {justCrossed ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 100,
              backgroundColor: "rgba(255,255,255,0.5)",
              transform: [{ translateX: tx }, { skewX: "-22deg" }],
            }}
          />
        ) : null}
        {/* Loc + label */}
        <View style={{ padding: 18, paddingTop: 18, paddingRight: 18 }}>
          <Text
            style={{
              color: "#fff",
              opacity: 0.85,
              fontFamily: BTFonts.sans,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            {v.loc}
          </Text>
          <Text
            style={{
              color: "#fff",
              fontFamily: BTFonts.serif,
              fontSize: 32,
              marginTop: 8,
              lineHeight: 34,
            }}
          >
            {v.label}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={{ padding: 18, paddingTop: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <BTNum size={28} color={t.ink} style={{ lineHeight: 28 }}>
              ${d.saved.toLocaleString()}
            </BTNum>
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 12, color: t.inkSoft }}>
              of ${d.target.toLocaleString()}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: justCrossed ? t.accent : t.ink + "10",
            }}
          >
            <Text
              style={{
                color: justCrossed ? t.bg : t.ink,
                fontFamily: BTFonts.sans,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.5,
              }}
            >
              {pct}%
            </Text>
          </View>
        </View>

        {/* Milestone track */}
        <View style={{ position: "relative", height: 14, marginBottom: 10 }}>
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 6,
              height: 2,
              backgroundColor: t.ink + "1a",
              borderRadius: 999,
            }}
          />
          <LinearGradient
            colors={v.grad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              position: "absolute",
              left: 0,
              top: 6,
              height: 2,
              width: `${pct}%`,
              borderRadius: 999,
            }}
          />
          {MILESTONES.map((m) => {
            const reached = pct >= m;
            const justHit = m === justCrossed;
            return (
              <View
                key={m}
                style={{
                  position: "absolute",
                  left: `${m}%`,
                  top: 1,
                  marginLeft: -6,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: reached ? v.grad[1] : t.bg,
                  borderWidth: 2,
                  borderColor: reached ? v.grad[1] : t.ink + "33",
                }}
              >
                {justHit ? (
                  <Animated.View
                    style={{
                      position: "absolute",
                      left: -8,
                      top: -8,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: v.grad[1],
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] }),
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            +$40 / wk auto
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            → {d.due}
          </Text>
        </View>

        {/* Tilly nudge for first dream */}
        {index === 0 ? (
          <View
            style={{
              marginTop: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: t.accentSoft,
              flexDirection: "row",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <Tilly t={t} size={22} state="idle" />
            <Text
              style={{
                flex: 1,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                color: t.ink,
                lineHeight: 17,
              }}
            >
              Skip two takeout meals a week and Barcelona arrives{" "}
              <Text style={{ fontWeight: "700" }}>Feb 18</Text> instead of March 5.
            </Text>
          </View>
        ) : null}

        {/* Just-crossed banner for laptop dream */}
        {index === 1 && justCrossed ? (
          <View
            style={{
              marginTop: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: v.grad[1] + "1f",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 16 }}>✦</Text>
            <Text
              style={{
                flex: 1,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                color: t.ink,
                lineHeight: 17,
              }}
            >
              You just crossed <Text style={{ fontWeight: "700" }}>{justCrossed}%</Text>. Three more
              paychecks and it's yours.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DiagonalStripes({ color, opacity }: { color: string; opacity: number }) {
  const lines = [];
  for (let i = 0; i < 18; i++) {
    lines.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: 600,
          height: 1,
          left: -200,
          top: i * 12 - 60,
          backgroundColor: color,
          opacity,
          transform: [{ rotate: "45deg" }],
        }}
      />,
    );
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}>
      {lines}
    </View>
  );
}
