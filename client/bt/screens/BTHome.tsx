/**
 * BTHome — "Today" — translated 1:1 from `screens.jsx::BTHome`.
 *
 * Critical features:
 *   1. **The Sky** — full-bleed 320px gradient header (160deg accent → accent2
 *      → surfaceAlt) with sun/moon halo (radial), 3 drifting clouds (btDrift
 *      animation), date label top-left, "✦ 12-day streak" chip top-right
 *      (semi-transparent ink + blur), and **Tilly size 220 breathing** at the
 *      bottom-center.
 *   2. **The Story** — "Tilly says" mono caps label + 32px serif greeting with
 *      italic accent on the key word (gentle / eight over), then a 14px sub.
 *   3. **Week strip** — 5 horizontal day cards (Tue/Wed/Thu/Fri/Sat) with
 *      mood-tinted backgrounds + accent dot per card.
 *   4. **Tilly learned** — accent ✦ chip + headline + body + Yes/No buttons.
 *   5. **Hero balance card** — ink bg with diagonal stripe texture, $412.58
 *      with cents at 0.45 opacity, rent + paycheck copy, accent ↗ pill.
 *   6. **Two color tiles** — CitiBike (accentSoft + Pause btn) + Barcelona
 *      (surfaceAlt + tiny progress bar).
 *   7. **Tilly invite pill** — small Tilly + italic "Anything you want to
 *      think through?" + accent → arrow → guardian tab.
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

import { BT_DATA, BT_HOME_WEEK, type BTDayCard } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BT_DRIFT_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BTSerif, BTLabel, BTNum } from "../atoms";

type Props = { onNav?: (id: "home" | "spend" | "guardian" | "dreams" | "profile") => void };

export function BTHome({ onNav }: Props) {
  const { t, tone, time } = useBT();
  const isMorning = time === "morning";
  const greeting = tone.greeting(BT_DATA.user.name);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── 1. The Sky — Tilly portrait, full bleed ─────────── */}
      <Sky t={t} isMorning={isMorning} />

      <View style={{ padding: 22, paddingTop: 24, paddingBottom: 28 }}>
        {/* ─── 2. The Story ─── */}
        <Text style={[styles.uppercaseLabel, { color: t.inkMute, marginBottom: 8 }]}>
          Tilly says
        </Text>
        <BTSerif size={32} color={t.ink} style={{ lineHeight: 38, marginBottom: 12 }}>
          {greeting}{" "}
          {isMorning ? (
            <>
              This week is shaping up{" "}
              <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
                gentle
              </Text>
              .
            </>
          ) : (
            <>
              You're{" "}
              <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
                eight over
              </Text>{" "}
              — Friday catches it.
            </>
          )}
        </BTSerif>
        <Text
          style={{
            fontFamily: BTFonts.sans,
            fontSize: 14,
            color: t.inkSoft,
            lineHeight: 21,
            marginBottom: 22,
          }}
        >
          {isMorning ? (
            <>
              $312 of breathing room. Rent posts{" "}
              <Text style={{ color: t.ink, fontWeight: "700" }}>Thursday</Text>, paycheck{" "}
              <Text style={{ color: t.ink, fontWeight: "700" }}>Friday</Text>. I'll keep an eye on
              coffee Wednesdays — that's your soft spot.
            </>
          ) : (
            <>
              Three coffees, one DoorDash. Your CitiBike pass renews tomorrow and you've barely
              touched it.
            </>
          )}
        </Text>

        {/* ─── 3. Week strip — horizontal scroll ─── */}
        <View style={{ marginHorizontal: -22, marginBottom: 24 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}
          >
            {BT_HOME_WEEK.map((day, i) => (
              <BTDayCardView key={i} day={day} t={t} />
            ))}
          </ScrollView>
        </View>

        {/* ─── 4. Tilly learned ─── */}
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 18,
            padding: 18,
            paddingTop: 16,
            borderWidth: 1,
            borderColor: t.ink + "10",
            marginBottom: 18,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: t.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: t.bg, fontSize: 11, fontWeight: "700" }}>✦</Text>
            </View>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 11,
                color: t.accent,
                letterSpacing: 1.32,
                textTransform: "uppercase",
                fontWeight: "700",
              }}
            >
              Tilly learned
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 10, color: t.inkMute }}>
              this week
            </Text>
          </View>
          <BTSerif size={20} color={t.ink} style={{ lineHeight: 26, marginBottom: 10 }}>
            You spend 2× more on Wednesdays. Six weeks running.
          </BTSerif>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 13,
              color: t.inkSoft,
              lineHeight: 19,
              marginBottom: 14,
            }}
          >
            Always between class — coffee, then DoorDash by 7. Want me to remind you Tuesday night
            to pack lunch?
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                backgroundColor: t.ink,
              }}
            >
              <Text
                style={{
                  color: t.bg,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Yes, remind me
              </Text>
            </Pressable>
            <Pressable
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: t.ink + "26",
              }}
            >
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Don't worry about it
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ─── 5. Hero balance card — ink bg with stripes ─── */}
        <View
          style={{
            backgroundColor: t.ink,
            borderRadius: 18,
            padding: 22,
            marginBottom: 18,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <DiagonalStripes color={t.bg} opacity={0.07} />
          <View style={{ position: "relative" }}>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 10,
                color: t.bg,
                opacity: 0.55,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 6,
                fontWeight: "600",
              }}
            >
              Available now
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 14 }}>
              <BTNum size={64} color={t.bg} style={{ lineHeight: 64 }}>
                $412
              </BTNum>
              <BTNum size={26} color={t.bg} style={{ opacity: 0.45 }}>
                .58
              </BTNum>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <Text
                style={{
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  color: t.bg,
                  opacity: 0.7,
                  lineHeight: 17,
                  flex: 1,
                  marginRight: 12,
                }}
              >
                After Thursday rent.{"\n"}Friday paycheck{" "}
                <Text style={{ color: t.accent, fontWeight: "700" }}>+$612</Text>
              </Text>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: t.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: BTFonts.serif,
                    fontSize: 22,
                    color: t.ink,
                  }}
                >
                  ↗
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ─── 6. Two color tiles ─── */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
          {/* CitiBike */}
          <View style={{ flex: 1, backgroundColor: t.accentSoft, padding: 14, paddingBottom: 16, borderRadius: 14 }}>
            <Text style={{ fontSize: 22, marginBottom: 6 }}>🚲</Text>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 13,
                fontWeight: "600",
                color: t.ink,
                lineHeight: 16,
              }}
            >
              CitiBike renews tomorrow
            </Text>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 11,
                color: t.ink,
                opacity: 0.65,
                marginTop: 4,
              }}
            >
              Used twice in 30 days
            </Text>
            <Pressable
              style={{
                marginTop: 10,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: t.ink,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: t.bg, fontFamily: BTFonts.sans, fontSize: 11, fontWeight: "500" }}>
                Pause $19.95
              </Text>
            </Pressable>
          </View>
          {/* Barcelona */}
          <View style={{ flex: 1, backgroundColor: t.surfaceAlt, padding: 14, paddingBottom: 16, borderRadius: 14 }}>
            <Text style={{ fontSize: 22, marginBottom: 6 }}>✺</Text>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 13,
                fontWeight: "600",
                color: t.ink,
                lineHeight: 16,
              }}
            >
              Barcelona fund
            </Text>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 11,
                color: t.ink,
                opacity: 0.65,
                marginTop: 4,
              }}
            >
              +$40 moves Friday
            </Text>
            <View style={{ marginTop: 12, height: 4, backgroundColor: t.ink + "1a", borderRadius: 999, overflow: "hidden" }}>
              <View style={{ width: "36%", height: "100%", backgroundColor: t.ink }} />
            </View>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 10,
                color: t.ink,
                opacity: 0.55,
                marginTop: 5,
              }}
            >
              $870 / $2,400
            </Text>
          </View>
        </View>

        {/* ─── 7. Tilly invite pill ─── */}
        <Pressable
          onPress={() => onNav?.("guardian")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: t.surface,
            borderRadius: 999,
          }}
        >
          <Tilly t={t} size={26} state="idle" />
          <Text
            style={{
              flex: 1,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              color: t.inkSoft,
              fontStyle: "italic",
            }}
          >
            "Anything you want to think through?"
          </Text>
          <Text style={{ color: t.accent, fontSize: 18, fontWeight: "500" }}>→</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** Full-bleed sky header with Tilly portrait. */
function Sky({ t, isMorning }: { t: BTTheme; isMorning: boolean }) {
  return (
    <View style={{ height: 320, position: "relative", overflow: "hidden" }}>
      <LinearGradient
        colors={[t.accent, t.accent2, t.surfaceAlt]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* sun/moon halo */}
      <View
        style={{
          position: "absolute",
          top: 36,
          right: 36,
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: t.bg,
          opacity: 0.6,
        }}
      />
      {/* drifting clouds */}
      {[0, 1, 2].map((i) => (
        <DriftCloud key={i} t={t} index={i} />
      ))}
      {/* date label */}
      <Text
        style={{
          position: "absolute",
          top: 56,
          left: 24,
          color: t.bg,
          opacity: 0.85,
          fontFamily: BTFonts.sans,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          fontWeight: "600",
        }}
      >
        {isMorning ? "Tue · April 27 · morning" : "Tue · April 27 · evening"}
      </Text>
      {/* streak chip */}
      <View
        style={{
          position: "absolute",
          top: 52,
          right: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: t.ink + "40",
        }}
      >
        <Text style={{ color: t.bg, fontSize: 12 }}>✦</Text>
        <Text
          style={{
            color: t.bg,
            fontFamily: BTFonts.sans,
            fontSize: 11,
            fontWeight: "600",
          }}
        >
          12-day streak
        </Text>
      </View>
      {/* Tilly */}
      <View
        style={{
          position: "absolute",
          bottom: -14,
          left: "50%",
          transform: [{ translateX: -110 }],
        }}
      >
        <Tilly t={t} size={220} state="idle" breathing />
      </View>
    </View>
  );
}

function DriftCloud({ t, index }: { t: BTTheme; index: number }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: BT_DRIFT_DURATION_MS + index * 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: BT_DRIFT_DURATION_MS + index * 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    // Random initial offset like CSS `${i*-3}s` delay
    drift.setValue(index * 0.15);
    loop.start();
    return () => loop.stop();
  }, [drift, index]);

  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: `${18 + index * 28}%`,
        left: `${-25 + index * 22}%`,
        width: 200,
        height: 80,
        borderRadius: 999,
        backgroundColor: t.bg,
        opacity: 0.16,
        transform: [{ translateX: tx }],
      }}
    />
  );
}

/** Day card — week strip on Home. Mood maps to bg/fg/dot color (source). */
function BTDayCardView({ day, t }: { day: BTDayCard; t: BTTheme }) {
  const palette = {
    now: { bg: t.ink, fg: t.bg, accent: t.accent },
    watch: { bg: t.surface, fg: t.ink, accent: t.warn },
    big: { bg: t.surfaceAlt, fg: t.ink, accent: t.bad },
    good: { bg: t.accentSoft, fg: t.ink, accent: t.good },
    maybe: { bg: t.surface, fg: t.ink, accent: t.inkMute },
  }[day.mood];

  return (
    <View
      style={{
        width: 112,
        padding: 12,
        paddingBottom: 14,
        backgroundColor: palette.bg,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.ink + "10",
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text
          style={{
            color: palette.fg,
            fontFamily: BTFonts.sans,
            fontSize: 10,
            opacity: 0.6,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: "600",
          }}
        >
          {day.d}
        </Text>
        <BTNum size={20} color={palette.fg}>
          {day.n}
        </BTNum>
      </View>
      <Text
        style={{
          color: palette.fg,
          fontFamily: BTFonts.sans,
          fontSize: 11,
          opacity: 0.78,
          lineHeight: 14,
          minHeight: 28,
        }}
      >
        {day.label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.accent }} />
        <Text
          style={{
            color: palette.fg,
            fontFamily: BTFonts.sans,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {day.amt}
        </Text>
      </View>
    </View>
  );
}

/** Diagonal repeating stripe — approximates CSS repeating-linear-gradient. */
function DiagonalStripes({ color, opacity }: { color: string; opacity: number }) {
  const lines = [];
  for (let i = 0; i < 28; i++) {
    lines.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: 800,
          height: 1,
          left: -200,
          top: i * 14 - 200,
          backgroundColor: color,
          opacity,
          transform: [{ rotate: "-45deg" }],
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

const styles = StyleSheet.create({
  uppercaseLabel: {
    fontFamily: BTFonts.sans,
    fontSize: 11,
    letterSpacing: 1.32,
    textTransform: "uppercase",
    fontWeight: "600",
  },
});
