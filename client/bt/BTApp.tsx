/**
 * BTApp — the BuildTogether (Tilly) shell.
 *
 * Hosts the BTProvider, the floating Tweaks button, and a 6-tab bottom bar
 * mapping to the spec's six screens (Home, Tilly, Spend, Credit, Dreams,
 * Profile). Self-contained: doesn't depend on the V1 navigation stack so the
 * design system stays clean.
 */
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

type Tab = "home" | "guardian" | "spend" | "credit" | "dreams" | "profile";

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: "home", label: "Today", glyph: "○" },
  { key: "guardian", label: "Tilly", glyph: "" },
  { key: "spend", label: "Spend", glyph: "≣" },
  { key: "credit", label: "Credit", glyph: "◔" },
  { key: "dreams", label: "Dreams", glyph: "✺" },
  { key: "profile", label: "You", glyph: "◍" },
];

export function BTApp() {
  return (
    <BTProvider>
      <BTGate />
    </BTProvider>
  );
}

/**
 * Onboarding gate — runs the 5-card flow until the user completes it,
 * then renders the main 6-tab shell. Loading state shows the breathing
 * Tilly mascot so the screen never goes blank.
 */
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
        <TweaksToggle />
        {tab === "home" && <BTHome onNav={(r) => setTab(r)} />}
        {tab === "guardian" && <BTGuardian />}
        {tab === "spend" && <BTSpend />}
        {tab === "credit" && <BTCredit />}
        {tab === "dreams" && <BTDreams />}
        {tab === "profile" && <BTProfile />}
      </View>

      {/* Custom bottom tab bar — 6 slots, Tilly in the middle */}
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
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: active ? t.accentSoft : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Tilly t={t} size={28} breathing={active} />
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? t.accent : t.inkMute },
                  ]}
                >
                  {tb.label}
                </Text>
              </Pressable>
            );
          }
          return (
            <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={styles.tabSlot}>
              <Text
                style={{
                  fontSize: 18,
                  color: active ? t.accent : t.inkMute,
                  fontFamily: BTFonts.serif,
                }}
              >
                {tb.glyph}
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? t.accent : t.inkMute },
                ]}
              >
                {tb.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  loading: { alignItems: "center", justifyContent: "center" },
  tabbar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tabSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 2,
  },
  tabLabel: {
    fontFamily: BTFonts.mono,
    fontSize: 9,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
});
