/**
 * BuildTogether design atoms — spec §3 ("Type system").
 *
 * Translated from the JSX prototype's `bt-system.jsx` into React Native.
 * Atoms accept a `style` prop merged into their inline style; never use
 * className for theming (per spec §7 "React conventions").
 */
import React from "react";
import { Text, View, StyleSheet } from "react-native";
import type { TextStyle, ViewStyle, StyleProp } from "react-native";

import { BTFonts, type BTTheme } from "./theme";

type SerifProps = {
  children: React.ReactNode;
  size?: number;
  weight?: TextStyle["fontWeight"];
  italic?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Headline serif — Instrument Serif. Renders as `<Text>` so it composes inside
 * RN flex layouts (the original `display` switch isn't relevant here).
 */
export function BTSerif({
  children,
  size = 28,
  weight = "400",
  italic = false,
  color,
  style,
}: SerifProps) {
  return (
    <Text
      style={[
        {
          fontFamily: BTFonts.serif,
          fontSize: size,
          lineHeight: size * 1.1,
          fontWeight: weight,
          fontStyle: italic ? "italic" : "normal",
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type LabelProps = {
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: StyleProp<TextStyle>;
};

/** Mono uppercase mini-label. Used sparingly per spec — 9–13px, 0.08–0.14em. */
export function BTLabel({ children, color, size = 11, style }: LabelProps) {
  return (
    <Text
      style={[
        {
          fontFamily: BTFonts.mono,
          fontSize: size,
          lineHeight: size + 4,
          letterSpacing: size * 0.12,
          textTransform: "uppercase",
          fontWeight: "600",
          color,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type NumProps = {
  children: React.ReactNode;
  size?: number;
  weight?: TextStyle["fontWeight"];
  italic?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Tabular-nums serif number for currency. */
export function BTNum({
  children,
  size = 32,
  weight = "500",
  italic = false,
  color,
  style,
}: NumProps) {
  return (
    <Text
      style={[
        {
          fontFamily: BTFonts.serif,
          fontSize: size,
          lineHeight: size * 1.05,
          fontWeight: weight,
          fontStyle: italic ? "italic" : "normal",
          color,
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type RuleProps = {
  color?: string;
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 1px hairline rule. Horizontal by default. */
export function BTRule({ color, vertical, style }: RuleProps) {
  return (
    <View
      style={[
        vertical
          ? { width: StyleSheet.hairlineWidth, alignSelf: "stretch" }
          : { height: StyleSheet.hairlineWidth, alignSelf: "stretch" },
        { backgroundColor: color ?? "rgba(0,0,0,0.1)" },
        style,
      ]}
    />
  );
}

type ChipProps = {
  children: React.ReactNode;
  bg?: string;
  fg?: string;
  style?: StyleProp<ViewStyle>;
};

/** Rounded mini-chip — used for delta indicators ("+12"), milestones, tags. */
export function BTChip({ children, bg, fg, style }: ChipProps) {
  return (
    <View
      style={[
        {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: bg ?? "rgba(0,0,0,0.06)",
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: BTFonts.mono,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: "700",
          color: fg ?? "#000",
        }}
      >
        {children}
      </Text>
    </View>
  );
}

type CardProps = {
  children: React.ReactNode;
  t: BTTheme;
  alt?: boolean;
  inverted?: boolean;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Generic surface card. `alt` flips to surfaceAlt, `inverted` flips to ink-bg
 * (used for the hero balance card on Home + score card on Credit).
 */
export function BTCard({
  children,
  t,
  alt,
  inverted,
  padding = 18,
  radius = 18,
  style,
}: CardProps) {
  const bg = inverted ? t.ink : alt ? t.surfaceAlt : t.surface;
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius,
          padding,
          borderWidth: 1,
          borderColor: inverted ? "transparent" : t.rule,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type CurrencyProps = {
  amount: number;
  size?: number;
  color?: string;
  italic?: boolean;
  centsOpacity?: number;
  weight?: TextStyle["fontWeight"];
  style?: StyleProp<TextStyle>;
};

/**
 * Renders a dollar amount with cents at reduced opacity (0.45 by default).
 * Used on the Home hero balance per spec §4.1.
 */
export function BTCurrency({
  amount,
  size = 64,
  color,
  italic,
  centsOpacity = 0.45,
  weight = "500",
  style,
}: CurrencyProps) {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100)
    .toString()
    .padStart(2, "0");
  return (
    <Text
      style={[
        {
          fontFamily: BTFonts.serif,
          fontSize: size,
          lineHeight: size * 1.02,
          fontWeight: weight,
          fontStyle: italic ? "italic" : "normal",
          color,
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {negative ? "-" : ""}${dollars.toLocaleString()}
      <Text style={{ opacity: centsOpacity }}>.{cents}</Text>
    </Text>
  );
}

/** Diagonal-stripe overlay. Used on the hero balance card + dream headers. */
export function BTStripes({
  color = "#fff",
  opacity = 0.07,
  size = 8,
}: {
  color?: string;
  opacity?: number;
  size?: number;
}) {
  // RN can't render true diagonal stripes without SVG; we approximate via
  // multiple thin overlapping rotated bars using View transforms. Cheap, but
  // close enough at the densities used in the spec.
  const bars = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    bars.push(
      <View
        key={i}
        style={{
          position: "absolute",
          width: 700,
          height: size / 2,
          left: -200,
          top: i * size * 4 - 200,
          backgroundColor: color,
          opacity,
          transform: [{ rotate: "-22deg" }],
        }}
      />,
    );
  }
  return (
    <View
      pointerEvents="none"
      style={{ ...StyleSheet.absoluteFillObject, overflow: "hidden" }}
    >
      {bars}
    </View>
  );
}
