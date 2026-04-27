/**
 * BTTabBar — 5-slot bottom tab bar. Translated from `bt-system.jsx`.
 *
 * Critical features (1:1 to source):
 *   - Order: Today / Spend / **Tilly center** / Dreams / You
 *   - Tilly is the *center* tab, rendered as a small breathing mascot (size 22)
 *   - Other tabs use stroked SVG icons (strokeWidth=1.6, round caps)
 *   - Active tab gets a 4px accent dot underneath the label
 *   - Labels: JetBrains Mono, 9px, 0.12em letterSpacing, uppercase
 *   - Border-top hairline at `${t.rule}22` (12% rule color)
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Tilly } from "./Tilly";
import { BTFonts, type BTTheme } from "./theme";

export type BTTabId = "home" | "spend" | "guardian" | "dreams" | "profile";

const TABS: { id: BTTabId; label: string }[] = [
  { id: "home", label: "Today" },
  { id: "spend", label: "Spend" },
  { id: "guardian", label: "Tilly" },
  { id: "dreams", label: "Dreams" },
  { id: "profile", label: "You" },
];

type Props = {
  active: BTTabId;
  t: BTTheme;
  onNav: (id: BTTabId) => void;
  bottomPad?: number;
};

export function BTTabBar({ active, t, onNav, bottomPad = 22 }: Props) {
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: t.surface,
          borderTopColor: t.rule + "22",
          paddingBottom: bottomPad,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <Pressable key={tab.id} onPress={() => onNav(tab.id)} style={styles.slot}>
            {tab.id === "guardian" ? (
              <Tilly t={t} size={22} state="idle" />
            ) : (
              <View style={styles.iconWrap}>
                <BTTabIcon id={tab.id} color={isActive ? t.ink : t.inkMute} />
              </View>
            )}
            <Text
              style={{
                fontFamily: BTFonts.mono,
                fontSize: 9,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                color: isActive ? t.ink : t.inkMute,
                fontWeight: "600",
              }}
            >
              {tab.label}
            </Text>
            {isActive ? (
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: t.accent,
                  marginTop: -2,
                }}
              />
            ) : (
              <View style={{ height: 2 }} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function BTTabIcon({ id, color }: { id: BTTabId; color: string }) {
  const s = {
    fill: "none" as const,
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "home":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={10} cy={10} r={7} {...s} />
          <Path d="M10 6 v4 l2.5 1.5" {...s} />
        </Svg>
      );
    case "spend":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Path d="M3 6 h14 M3 10 h14 M3 14 h9" {...s} />
        </Svg>
      );
    case "dreams":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Path d="M10 3 l2 4 4 .5 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -.5 z" {...s} />
        </Svg>
      );
    case "profile":
      return (
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx={10} cy={7} r={3} {...s} />
          <Path d="M4 17 c1 -3 4 -4.5 6 -4.5 s5 1.5 6 4.5" {...s} />
        </Svg>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 52,
    gap: 4,
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
