/**
 * BTCredit — the one number, contextual. Translated 1:1 from `screens.jsx::BTCredit`.
 *
 * Critical features:
 *   - **Why this matters today** — accent ✦ label + Tilly 32 + 22px serif
 *     headline with italic accent on "38%"
 *   - **Utilization gauge card**:
 *     - Header: "Utilization" mono caps + "$190 of $500" right-aligned
 *     - **72px BTNum in `bad` red** + 28px % at 0.6 opacity, "aim for 30%" right-aligned with `good`-colored target
 *     - **Gauge bar**: 10px tall, 999 radius, fill is a `good→warn→bad`
 *       gradient stopped at the current pct. **Vertical 2px ink line at
 *       targetPct** with "TARGET" mono label above
 *     - Action button: full-width ink pill "Pay $50 now → drop to 28%"
 *   - **Score card** — ink bg with diagonal stripes — "VantageScore" caps,
 *     56px BTNum 704 + accent +12 chip + "since March · good"
 *   - **Levers** — 3 rows with vertical 6×36 bar (good or inkMute), name +
 *     note + value
 *   - **Tilly protected** — accentSoft card with Tilly 22 + "Tilly protected
 *     you · 24h" caps + sentence
 */
import React from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BT_CREDIT } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTFonts, type BTTheme } from "../theme";
import { BTLabel, BTNum, BTSerif } from "../atoms";

export function BTCredit() {
  const { t } = useBT();
  const c = BT_CREDIT;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Why this matters today */}
      <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Text style={{ color: t.accent, fontSize: 14 }}>✦</Text>
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
            Why this matters today
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 18 }}>
          <View style={{ marginTop: 2, flexShrink: 0 }}>
            <Tilly t={t} size={32} state="idle" />
          </View>
          <BTSerif size={22} color={t.ink} style={{ flex: 1, lineHeight: 28 }}>
            You're at{" "}
            <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
              38%
            </Text>{" "}
            of your limit. Lenders want under 30. Pay $50 today and you're there.
          </BTSerif>
        </View>
      </View>

      {/* Utilization gauge card */}
      <View
        style={{
          marginHorizontal: 22,
          marginBottom: 18,
          padding: 22,
          paddingVertical: 24,
          borderRadius: 18,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.ink + "10",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <BTLabel color={t.inkMute}>Utilization</BTLabel>
          <Text style={{ fontFamily: BTFonts.sans, fontSize: 11, color: t.inkSoft }}>
            ${c.used} of ${c.limit}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 6,
            marginBottom: 18,
          }}
        >
          <BTNum size={72} color={t.bad} style={{ lineHeight: 72 }}>
            {c.utilPct}
          </BTNum>
          <BTNum size={28} color={t.bad} style={{ opacity: 0.6 }}>
            %
          </BTNum>
          <View style={{ flex: 1 }} />
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 11, color: t.inkSoft }}>aim for</Text>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 13,
                color: t.good,
                fontWeight: "700",
              }}
            >
              {c.targetPct}%
            </Text>
          </View>
        </View>

        {/* Gauge bar */}
        <View
          style={{
            position: "relative",
            height: 10,
            backgroundColor: t.ink + "10",
            borderRadius: 999,
            overflow: "visible",
            marginBottom: 18,
          }}
        >
          {/* fill */}
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${c.utilPct}%`,
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[t.good, t.warn, t.bad]}
              locations={[0, c.targetPct / c.utilPct, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
          {/* target marker */}
          <View
            style={{
              position: "absolute",
              left: `${c.targetPct}%`,
              top: -4,
              bottom: -4,
              width: 2,
              backgroundColor: t.ink,
              borderRadius: 1,
            }}
          />
          <Text
            style={{
              position: "absolute",
              left: `${c.targetPct}%`,
              top: -22,
              transform: [{ translateX: -16 }],
              fontFamily: BTFonts.sans,
              fontSize: 9,
              color: t.ink,
              fontWeight: "700",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            target
          </Text>
        </View>

        <Pressable
          style={{
            paddingHorizontal: 16,
            paddingVertical: 11,
            backgroundColor: t.ink,
            borderRadius: 999,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Pay $50 now → drop to 28%
          </Text>
        </Pressable>
      </View>

      {/* Score card — ink bg with stripes */}
      <View
        style={{
          marginHorizontal: 22,
          marginBottom: 18,
          padding: 22,
          paddingVertical: 20,
          borderRadius: 18,
          backgroundColor: t.ink,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <DiagonalStripes color={t.bg} opacity={0.07} />
        <View>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.bg,
              opacity: 0.6,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 4,
              fontWeight: "600",
            }}
          >
            VantageScore
          </Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <BTNum size={56} color={t.bg} style={{ lineHeight: 56 }}>
              {c.score}
            </BTNum>
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 12,
                color: t.accent,
                fontWeight: "700",
              }}
            >
              +{c.delta}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.bg,
              opacity: 0.7,
              marginTop: 4,
            }}
          >
            since {c.since} · good
          </Text>
        </View>
      </View>

      {/* Levers */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
        <BTLabel color={t.inkMute} style={{ marginBottom: 10 }}>
          Levers
        </BTLabel>
        {c.levers.map((f) => (
          <View
            key={f.f}
            style={{
              padding: 14,
              paddingHorizontal: 14,
              marginBottom: 6,
              borderRadius: 12,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.ink + "10",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 6,
                height: 36,
                borderRadius: 999,
                backgroundColor: f.tone === "good" ? t.good : t.inkMute,
              }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: BTFonts.sans,
                  fontSize: 13,
                  fontWeight: "600",
                  color: t.ink,
                }}
              >
                {f.f}
              </Text>
              <Text
                style={{
                  fontFamily: BTFonts.sans,
                  fontSize: 11,
                  color: t.inkSoft,
                  marginTop: 2,
                }}
              >
                {f.note}
              </Text>
            </View>
            <BTNum size={18} color={t.ink}>
              {f.v}
            </BTNum>
          </View>
        ))}
      </View>

      {/* Tilly protected */}
      <View
        style={{
          marginHorizontal: 22,
          marginBottom: 24,
          padding: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 14,
          backgroundColor: t.accentSoft,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Tilly t={t} size={22} state="idle" />
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 11,
              color: t.ink,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              fontWeight: "700",
            }}
          >
            Tilly protected you · 24h
          </Text>
        </View>
        <Text
          style={{
            fontFamily: BTFonts.sans,
            fontSize: 13,
            color: t.ink,
            lineHeight: 19,
          }}
        >
          {c.protectedNote}
        </Text>
      </View>
    </ScrollView>
  );
}

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
