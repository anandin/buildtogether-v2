/**
 * BTSpending — pattern of the week. Translated 1:1 from `screens.jsx::BTSpending`.
 *
 * Critical features:
 *   - **Paycheck shimmer banner** at top — accent → accent2 gradient with a
 *     light-sweep shimmer overlay (btShimmer 3.2s linear). "✦ Friday lands ·
 *     Paycheck +$612 · in 2 days"
 *   - **Pattern story** — "This week's pattern" mono caps + 28px serif
 *     headline with italic accent on "Wednesdays"
 *   - **7-day bar chart** — heights ∝ spend, bars 80px tall, today gets
 *     accent fill + 3px ring shadow + bold bottom letter, soft-spot days in
 *     accent2, normal in 20% ink
 *   - **Where it goes** — 5 category rows with a colored 8×36 side bar, name
 *     + soft-spot label (in category color), one-liner context, big amount
 *   - **Today ledger** — recent transactions (BTLedgerRow) with first-letter
 *     avatar, mono category caps, mono right-aligned amount
 *   - **FAB +** floating bottom-right above tab bar
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

import {
  BT_DATA,
  BT_SPEND_CATEGORIES,
  BT_SPEND_DAYS,
  type BTRecent,
  type BTSpendCategory,
} from "../data";
import { useBT } from "../BTContext";
import { BT_SHIMMER_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BTLabel, BTNum, BTSerif } from "../atoms";

export function BTSpend() {
  const { t } = useBT();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Paycheck shimmer banner */}
        <PaycheckBanner t={t} />

        {/* Pattern story */}
        <View style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 8 }}>
          <BTLabel color={t.inkMute} style={{ marginBottom: 8 }}>
            This week's pattern
          </BTLabel>
          <BTSerif size={28} color={t.ink} style={{ lineHeight: 34 }}>
            $148 spent.{" "}
            <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
              Wednesdays
            </Text>{" "}
            are still your soft spot.
          </BTSerif>
        </View>

        {/* 7-day bar chart */}
        <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 22 }}>
          <DayBars t={t} />
        </View>

        {/* Where it goes */}
        <View style={{ paddingHorizontal: 22, paddingBottom: 14 }}>
          <BTLabel color={t.inkMute} style={{ marginBottom: 12 }}>
            Where it goes
          </BTLabel>
          <View style={{ gap: 8 }}>
            {BT_SPEND_CATEGORIES.map((c) => (
              <CategoryRow key={c.name} c={c} t={t} />
            ))}
          </View>
        </View>

        {/* Today ledger */}
        <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24 }}>
          <BTLabel color={t.inkMute} style={{ marginBottom: 8 }}>
            Today
          </BTLabel>
          {BT_DATA.recent
            .filter((r) => r.tag === "today")
            .map((r) => (
              <LedgerRow key={r.id} r={r} t={t} />
            ))}
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={{
          position: "absolute",
          right: 20,
          bottom: 28,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: t.accent,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
          elevation: 8,
        }}
      >
        <Text
          style={{
            color: t.bg,
            fontFamily: BTFonts.serif,
            fontSize: 28,
            lineHeight: 28,
          }}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}

function PaycheckBanner({ t }: { t: BTTheme }) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(slide, {
        toValue: 1,
        duration: BT_SHIMMER_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [slide]);

  const tx = slide.interpolate({ inputRange: [0, 1], outputRange: [-200, 380] });

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 20,
        borderRadius: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <LinearGradient
        colors={[t.accent, t.accent2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          padding: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Text style={{ color: t.bg, fontSize: 18 }}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.sans,
              fontSize: 11,
              opacity: 0.85,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              fontWeight: "600",
            }}
          >
            Friday lands
          </Text>
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.sans,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Paycheck +$612 · in 2 days
          </Text>
        </View>
      </LinearGradient>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 90,
          backgroundColor: t.bg,
          opacity: 0.4,
          transform: [{ translateX: tx }, { skewX: "-22deg" }],
        }}
      />
    </View>
  );
}

function DayBars({ t }: { t: BTTheme }) {
  const max = 50;
  return (
    <View style={{ flexDirection: "row", gap: 6, height: 80, alignItems: "flex-end" }}>
      {BT_SPEND_DAYS.map((day, i) => {
        const h = (day.amt / max) * 100;
        const isToday = day.mood === "today";
        const isSoft = day.mood === "soft";
        const isLow = day.mood === "low";
        const bar = isToday
          ? t.accent
          : isSoft
          ? t.accent2
          : isLow
          ? t.ink + "22"
          : t.ink + "33";
        return (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <Text
              style={{
                color: t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 9,
                fontWeight: "600",
              }}
            >
              ${day.amt}
            </Text>
            <View
              style={{
                width: "100%",
                height: `${h}%`,
                minHeight: 4,
                borderRadius: 4,
                backgroundColor: bar,
                shadowColor: isToday ? t.accent : "transparent",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: isToday ? 0.2 : 0,
                shadowRadius: 6,
              }}
            />
            <Text
              style={{
                color: isToday ? t.accent : t.inkMute,
                fontFamily: BTFonts.sans,
                fontSize: 10,
                fontWeight: isToday ? "700" : "500",
                letterSpacing: 0.5,
              }}
            >
              {day.d}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function CategoryRow({ c, t }: { c: BTSpendCategory; t: BTTheme }) {
  const hueColor =
    c.hue === "accent"
      ? t.accent
      : c.hue === "accent2"
      ? t.accent2
      : c.hue === "good"
      ? t.good
      : c.hue === "warn"
      ? t.warn
      : t.inkSoft;

  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: c.soft ? hueColor + "1f" : t.surface,
        borderWidth: 1,
        borderColor: c.soft ? hueColor + "40" : t.ink + "10",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View style={{ width: 8, height: 36, borderRadius: 999, backgroundColor: hueColor }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 14,
              fontWeight: "600",
              color: t.ink,
            }}
          >
            {c.name}
          </Text>
          {c.soft ? (
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 10,
                color: hueColor,
                fontWeight: "700",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              soft spot
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            fontFamily: BTFonts.sans,
            fontSize: 11,
            color: t.inkSoft,
            marginTop: 2,
          }}
        >
          {c.note}
        </Text>
      </View>
      <BTNum size={20} color={t.ink}>
        ${c.amt}
      </BTNum>
    </View>
  );
}

function LedgerRow({ r, t }: { r: BTRecent; t: BTTheme }) {
  const negative = r.amt > 0 && !r.incoming;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.rule + "22",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 4,
          backgroundColor: t.chip,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: BTFonts.serif,
            fontSize: 16,
            color: t.ink,
          }}
        >
          {r.who.charAt(0)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: BTFonts.sans,
            fontSize: 14,
            color: t.ink,
            fontWeight: "500",
          }}
        >
          {r.who}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 2 }}>
          <BTLabel color={t.inkMute}>{r.cat}</BTLabel>
          {r.flag ? (
            <Text
              style={{
                fontFamily: BTFonts.mono,
                fontSize: 9,
                color: t.warn,
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              · flagged
            </Text>
          ) : null}
          {r.tag === "sub" ? (
            <Text
              style={{
                fontFamily: BTFonts.mono,
                fontSize: 9,
                color: t.inkMute,
                textTransform: "uppercase",
                letterSpacing: 0.7,
              }}
            >
              · subscription
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={{
          fontFamily: BTFonts.mono,
          fontSize: 13,
          color: r.incoming ? t.good : t.ink,
          fontVariant: ["tabular-nums"],
        }}
      >
        {r.incoming ? "+" : negative ? "−" : ""}${Math.abs(r.amt).toFixed(2)}
      </Text>
    </View>
  );
}
