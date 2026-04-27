/**
 * BTCredit — the one number. Spec §4.4.
 *
 * Built around utilization. Action over abstraction: a $50 payment moves the
 * gauge to 28% today. Score card sits below as a quieter signal.
 */
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BT_DATA } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTCard, BTLabel, BTNum, BTSerif, BTStripes } from "../atoms";
import { BTFonts } from "../theme";

export function BTCredit() {
  const { t } = useBT();
  const c = BT_DATA.credit;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Why this matters today */}
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.accent, fontSize: 14 }}>✦</Text>
          <BTLabel color={t.accent}>Why this matters today</BTLabel>
        </View>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <Tilly t={t} size={56} />
          <BTSerif size={22} color={t.ink} style={{ flex: 1, lineHeight: 28 }}>
            You're at 38% of your limit. Lenders want under 30. Pay{" "}
            <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>$50</Text>{" "}
            today and you're there.
          </BTSerif>
        </View>
      </View>

      {/* Utilization gauge — the hero */}
      <BTCard t={t} padding={22}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <BTLabel color={t.inkMute}>Utilization</BTLabel>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 13,
                marginTop: 4,
              }}
            >
              ${c.used} of ${c.limit}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <BTLabel color={t.inkMute} size={9}>aim for</BTLabel>
            <BTSerif size={18} color={t.inkSoft}>{c.target}%</BTSerif>
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          <BTNum size={72} color={t.bad}>
            {c.pct}%
          </BTNum>
        </View>

        {/* Gauge bar */}
        <View style={{ marginTop: 16, height: 12, borderRadius: 999, overflow: "hidden", backgroundColor: t.surfaceAlt }}>
          <LinearGradient
            colors={[t.good, t.warn, t.bad]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${c.pct}%`, height: "100%" }}
          />
        </View>
        <View style={{ position: "relative", marginTop: 4, height: 16 }}>
          {/* target marker */}
          <View
            style={{
              position: "absolute",
              left: `${c.target}%`,
              top: -22,
              width: 1.5,
              height: 18,
              backgroundColor: t.ink,
            }}
          />
          <Text
            style={{
              position: "absolute",
              left: `${c.target}%`,
              transform: [{ translateX: -16 }],
              color: t.ink,
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontWeight: "700",
            }}
          >
            target
          </Text>
        </View>

        {/* CTA */}
        <Pressable
          style={{
            marginTop: 16,
            backgroundColor: t.ink,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: t.surface,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            Pay $50 now → drop to 28%
          </Text>
        </Pressable>
      </BTCard>

      {/* Score card — ink bg with stripes */}
      <BTCard t={t} inverted padding={18}>
        <BTStripes color="#fff" opacity={0.07} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text
              style={{
                color: "rgba(255,252,246,0.6)",
                fontFamily: BTFonts.mono,
                fontSize: 9,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              VantageScore
            </Text>
            <Text
              style={{
                color: "#FFFCF6",
                fontFamily: BTFonts.serif,
                fontSize: 44,
                fontWeight: "500",
                marginTop: 4,
              }}
            >
              {c.score}
            </Text>
            <Text
              style={{
                color: "rgba(255,252,246,0.55)",
                fontFamily: BTFonts.sans,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              +{c.delta} since {c.since}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: t.accent,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: BTFonts.mono,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                fontWeight: "700",
              }}
            >
              good
            </Text>
          </View>
        </View>
      </BTCard>

      {/* Levers */}
      <View style={{ gap: 8 }}>
        <BTLabel color={t.inkMute}>Levers</BTLabel>
        {[
          { label: "Payment history", value: c.payment.ratio, state: c.payment.state, note: c.payment.note },
          { label: "Account age", value: c.age.value, state: c.age.state, note: c.age.note },
          { label: "Hard inquiries", value: c.inquiries.value, state: c.inquiries.state, note: c.inquiries.note },
        ].map((l) => (
          <View
            key={l.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              borderRadius: 16,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.rule,
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                {l.label}
              </Text>
              <Text
                style={{
                  color: t.inkSoft,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                {l.note}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 18 }}>{l.value}</Text>
              <Text
                style={{
                  color:
                    l.state === "good" ? t.good : l.state === "neutral" ? t.inkMute : t.warn,
                  fontFamily: BTFonts.mono,
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  marginTop: 2,
                }}
              >
                {l.state}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Tilly protected you */}
      <BTCard t={t} padding={16} style={{ backgroundColor: t.accentSoft, borderColor: "transparent", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Tilly t={t} size={28} breathing={false} />
          <BTLabel color={t.accent}>Tilly protected you · 24h</BTLabel>
        </View>
        {c.protected.map((p, i) => (
          <Text
            key={i}
            style={{ color: t.ink, fontFamily: BTFonts.serif, fontSize: 15, lineHeight: 21 }}
          >
            {p}
          </Text>
        ))}
      </BTCard>
    </ScrollView>
  );
}
