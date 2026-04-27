/**
 * BTHome — "Today" — spec §4.1.
 *
 * The morning briefing / night check-in. One huge serif headline; the number
 * that matters is *breathing room*, not balance.
 */
import React from "react";
import { ScrollView, View, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BT_DATA } from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import {
  BTSerif,
  BTLabel,
  BTCard,
  BTCurrency,
  BTChip,
  BTStripes,
} from "../atoms";
import { BTFonts } from "../theme";
import { Text } from "react-native";

type Props = { onNav?: (route: BTRoute) => void };
export type BTRoute = "home" | "guardian" | "spend" | "credit" | "dreams" | "profile";

export function BTHome({ onNav }: Props) {
  const { t, tone, time } = useBT();
  const dayLabel =
    time === "morning" ? "Tuesday morning" : "Tuesday · 9:18 pm";
  const greeting = tone.greeting(BT_DATA.user.name);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 22 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Time stamp + greeting block */}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 10 }}>
          <BTLabel color={t.inkMute}>{dayLabel}</BTLabel>
          <BTSerif size={44} color={t.ink} weight="500">
            {greeting}
          </BTSerif>
          <BTSerif size={22} color={t.inkSoft} weight="400">
            You have{" "}
            <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
              ${BT_DATA.hero.breathing}
            </Text>{" "}
            of breathing room this week.
          </BTSerif>
        </View>
        <Tilly t={t} size={84} halo />
      </View>

      {/* Hero balance card — ink-bg with stripe texture */}
      <BTCard t={t} inverted padding={22} radius={22}>
        <BTStripes color="#fff" opacity={0.07} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <BTLabel color="rgba(255,255,255,0.55)">After Thursday rent</BTLabel>
          <BTChip bg={t.accentSoft} fg={t.accent}>↗ +$612</BTChip>
        </View>
        <View style={{ marginTop: 14 }}>
          <BTCurrency amount={BT_DATA.hero.afterRent} size={68} color="#FFFCF6" />
        </View>
        <Text
          style={{
            color: "rgba(255,252,246,0.6)",
            fontFamily: BTFonts.sans,
            fontSize: 13,
            marginTop: 10,
          }}
        >
          {BT_DATA.hero.paycheckCopy}
        </Text>
      </BTCard>

      {/* Two-tile row */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        {/* Subscription tile */}
        <BTCard
          t={t}
          padding={16}
          style={{ flex: 1, backgroundColor: t.accentSoft, borderColor: "transparent" }}
        >
          <BTLabel color={t.accent} size={10}>
            renews tomorrow
          </BTLabel>
          <BTSerif size={20} color={t.ink} style={{ marginTop: 8 }}>
            CitiBike
          </BTSerif>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Used twice in 30 days
          </Text>
          <Pressable
            style={{
              marginTop: 14,
              backgroundColor: t.ink,
              borderRadius: 999,
              paddingVertical: 8,
              paddingHorizontal: 12,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ color: t.surface, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 12 }}>
              Pause $19.95
            </Text>
          </Pressable>
        </BTCard>

        {/* Dream tile */}
        <BTCard t={t} alt padding={16} style={{ flex: 1 }}>
          <BTLabel color={t.inkMute} size={10}>
            Barcelona fund
          </BTLabel>
          <BTSerif size={20} color={t.ink} style={{ marginTop: 8 }}>
            +$40 Friday
          </BTSerif>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            $870 of $2,400
          </Text>
          {/* Progress */}
          <View
            style={{
              marginTop: 14,
              height: 6,
              backgroundColor: t.rule,
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[t.accent, t.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${(870 / 2400) * 100}%`, height: "100%" }}
            />
          </View>
        </BTCard>
      </View>

      {/* Tilly invite pill */}
      <Pressable
        onPress={() => onNav?.("guardian")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 999,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.rule,
        }}
      >
        <Tilly t={t} size={36} breathing={false} />
        <Text
          style={{
            flex: 1,
            color: t.inkSoft,
            fontFamily: BTFonts.serif,
            fontStyle: "italic",
            fontSize: 16,
          }}
        >
          Anything you want to think through?
        </Text>
        <Text style={{ color: t.accent, fontSize: 18 }}>→</Text>
      </Pressable>
    </ScrollView>
  );
}
