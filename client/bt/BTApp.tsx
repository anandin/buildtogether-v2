/**
 * BTApp — the BuildTogether (Tilly) shell.
 *
 * Hosts the BTProvider, the floating Tweaks button, and the 5-tab bottom bar
 * mapping to the spec's screens (Today, Spend, Tilly, Dreams, You). Credit
 * lives inside the Today flow per design (it's a contextual surface, not a
 * destination), so the bottom nav doesn't expose it as a peer.
 *
 * Self-contained: doesn't depend on the V1 navigation stack so the design
 * system stays clean.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { BTProvider, useBT } from "./BTContext";
import { TweaksToggle } from "./TweaksPanel";
import { Tilly } from "./Tilly";
import { BTFonts } from "./theme";
import { BTHome } from "./screens/BTHome";
import { BTGuardian } from "./screens/BTGuardian";
import { BTSpend } from "./screens/BTSpend";
import { BTCredit } from "./screens/BTCredit";
import { BTDreams } from "./screens/BTDreams";
import { BTProfile } from "./screens/BTProfile";
import { Onboarding } from "./onboarding/Onboarding";
import { useOnboardingStatus } from "./hooks/useOnboarding";

type Tab = "home" | "spend" | "guardian" | "credit" | "dreams" | "profile";

// Order matches design/screens.jsx tab bar exactly: Today, Spend, Tilly
// (center), Dreams, You. Credit is reachable from Home but not in the bar.
const TABS: { key: Tab; label: string }[] = [
  { key: "home", label: "Today" },
  { key: "spend", label: "Spend" },
  { key: "guardian", label: "Tilly" },
  { key: "dreams", label: "Dreams" },
  { key: "profile", label: "You" },
];

export function BTApp() {
  return (
    <BTProvider>
      <BTGate />
    </BTProvider>
  );
}

function BTGate() {
  const { t } = useBT();
  const status = useOnboardingStatus();

  if (status.isLoading || !status.data) {
    return (
      <View style={[styles.root, styles.loading, { backgroundColor: t.bg }]}>
        <Tilly t={t} size={84} halo />
      </View>
    );
  }

  if (!status.data.hasCompletedOnboarding) {
    return <Onboarding />;
  }

  return <BTShell />;
}

function BTShell() {
  const { t } = useBT();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("home");

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.body, { paddingTop: insets.top }]}>
        {tab === "home" && <BTHome onNav={(r) => setTab(r)} />}
        {tab === "guardian" && <BTGuardian />}
        {tab === "spend" && <BTSpend />}
        {tab === "credit" && <BTCredit />}
        {tab === "dreams" && <BTDreams />}
        {tab === "profile" && <BTProfile />}
        <TweaksToggle />
      </View>

      <View
        style={[
          styles.tabbar,
          {
            backgroundColor: t.surface,
            borderTopColor: t.rule,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        {TABS.map((tb) => {
          const active = tab === tb.key;
          if (tb.key === "guardian") {
            return (
              <Pressable
                key={tb.key}
                onPress={() => setTab(tb.key)}
                style={styles.tabSlot}
                accessibilityRole="button"
                accessibilityLabel={tb.label}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Tilly t={t} size={26} breathing={active} />
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? t.ink : t.inkMute },
                  ]}
                >
                  {tb.label}
                </Text>
                {active ? <View style={[styles.tabDot, { backgroundColor: t.accent }]} /> : <View style={styles.tabDotPlaceholder} />}
              </Pressable>
            );
          }
          return (
            <Pressable
              key={tb.key}
              onPress={() => setTab(tb.key)}
              style={styles.tabSlot}
              accessibilityRole="button"
              accessibilityLabel={tb.label}
            >
              <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
                <TabIcon id={tb.key} color={active ? t.ink : t.inkMute} />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? t.ink : t.inkMute },
                ]}
              >
                {tb.label}
              </Text>
              {active ? <View style={[styles.tabDot, { backgroundColor: t.accent }]} /> : <View style={styles.tabDotPlaceholder} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Line-icon set per design/bt-system.jsx — clean 20×20 strokes, 1.6 width.
 * Replaces the old serif-glyph approach which read as a kid's drawing.
 */
function TabIcon({ id, color }: { id: Tab; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (id === "home") {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx={10} cy={10} r={7} {...stroke} />
        <Path d="M10 6v4l2.5 1.5" {...stroke} />
      </Svg>
    );
  }
  if (id === "spend") {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Path d="M3 6h14M3 10h14M3 14h9" {...stroke} />
      </Svg>
    );
  }
  if (id === "dreams") {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Path d="M10 3l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" {...stroke} />
      </Svg>
    );
  }
  if (id === "profile") {
    return (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Circle cx={10} cy={7} r={3} {...stroke} />
        <Path d="M4 17c1-3 4-4.5 6-4.5s5 1.5 6 4.5" {...stroke} />
      </Svg>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  loading: { alignItems: "center", justifyContent: "center" },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tabSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 4,
    gap: 4,
  },
  tabLabel: {
    fontFamily: BTFonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: -2,
  },
  // Reserves the same vertical slot as the active dot so labels don't shift
  // when a tab is selected.
  tabDotPlaceholder: {
    width: 4,
    height: 4,
    marginTop: -2,
  },
});
