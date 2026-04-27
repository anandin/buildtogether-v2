/**
 * BTApp — the BuildTogether (Tilly) shell.
 *
 * Hosts the BTProvider, the floating Tweaks button, and a **5-tab** bottom
 * bar matching the source: Today / Spend / Tilly center / Dreams / You.
 *
 * **Credit** is *not* a tab — per source `screens.jsx`, it's reached via
 * deep link. We expose a small "View credit" link on Home and Profile that
 * pushes to the Credit screen via a stack-like state machine here.
 */
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BTProvider, useBT } from "./BTContext";
import { TweaksToggle } from "./TweaksPanel";
import { BTTabBar, type BTTabId } from "./BTTabBar";
import { BTFonts } from "./theme";
import { BTHome } from "./screens/BTHome";
import { BTGuardian } from "./screens/BTGuardian";
import { BTSpend } from "./screens/BTSpend";
import { BTCredit } from "./screens/BTCredit";
import { BTDreams } from "./screens/BTDreams";
import { BTProfile } from "./screens/BTProfile";

type Route = BTTabId | "credit";

export function BTApp() {
  return (
    <BTProvider>
      <BTShell />
    </BTProvider>
  );
}

function BTShell() {
  const { t } = useBT();
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<Route>("home");

  // Last visited tab — so the back arrow from Credit returns there.
  const [lastTab, setLastTab] = useState<BTTabId>("home");

  const onNavTab = (id: BTTabId) => {
    setRoute(id);
    setLastTab(id);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <TweaksToggle />

      {/* Credit deep-link header (only when on credit) */}
      {route === "credit" ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            gap: 8,
          }}
        >
          <Pressable
            onPress={() => setRoute(lastTab)}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Path
                d="M12 4 L 6 10 L 12 16"
                stroke={t.ink}
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 18,
              color: t.ink,
            }}
          >
            Credit
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {route === "home" ? <BTHome onNav={onNavTab} /> : null}
        {route === "spend" ? <BTSpend /> : null}
        {route === "guardian" ? <BTGuardian /> : null}
        {route === "credit" ? <BTCredit /> : null}
        {route === "dreams" ? <BTDreams /> : null}
        {route === "profile" ? (
          <BTProfile />
        ) : null}
      </View>

      {/* Floating "View credit" deep link from Home/Profile */}
      {(route === "home" || route === "profile") && (
        <Pressable
          onPress={() => setRoute("credit")}
          style={{
            position: "absolute",
            right: 16,
            bottom: insets.bottom + 90,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: t.ink,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Text
            style={{
              color: t.bg,
              fontFamily: BTFonts.mono,
              fontSize: 9,
              letterSpacing: 1.1,
              textTransform: "uppercase",
              fontWeight: "700",
            }}
          >
            credit
          </Text>
          <Text style={{ color: t.accent, fontSize: 12 }}>→</Text>
        </Pressable>
      )}

      <BTTabBar
        active={route === "credit" ? lastTab : (route as BTTabId)}
        t={t}
        onNav={onNavTab}
        bottomPad={Math.max(insets.bottom, 22)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
