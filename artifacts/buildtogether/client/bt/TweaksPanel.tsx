/**
 * TweaksPanel — spec §6.
 *
 * Toggleable sheet exposing the three knobs that change the prototype's
 * surface presentation: theme, tone, time of day. Lives behind a small
 * floating "✦ tweaks" button in the top-right of the BT shell.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  StyleSheet,
} from "react-native";

import { useBT } from "./BTContext";
import { BT_THEMES, BTFonts, type BTThemeKey } from "./theme";
import { BT_TONES, type BTTimeOfDay, type BTToneKey } from "./tones";
import { BTLabel, BTRule } from "./atoms";

export function TweaksToggle() {
  const { t } = useBT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          position: "absolute",
          top: 18,
          right: 18,
          zIndex: 50,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.rule,
        }}
      >
        <Text style={{ color: t.accent, fontSize: 11 }}>✦</Text>
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.mono,
            fontSize: 9,
            letterSpacing: 1.3,
            textTransform: "uppercase",
            fontWeight: "700",
          }}
        >
          tweaks
        </Text>
      </Pressable>
      <TweaksPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TweaksPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, themeKey, setTheme, toneKey, setTone, time, setTime } = useBT();
  // Animated slide-up. Replaces the previous RN Modal because Modal's
  // backdrop covered the tab bar — making "Spend" / other tabs feel
  // unclickable while Tweaks was open. This panel is a sibling overlay
  // anchored above the tab bar so the tabs stay reachable.
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  if (!open && (slide as any)._value === 0) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });
  const backdropOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] });

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={open ? "auto" : "none"}>
      {/* Backdrop — only covers the screen ABOVE the tab bar (~80px) so
          tabs stay clickable. Tap to dismiss. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { bottom: 80, backgroundColor: "#000", opacity: backdropOpacity },
        ]}
        pointerEvents={open ? "auto" : "none"}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Slide-up sheet */}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 80,
          transform: [{ translateY }],
        }}
      >
        <View
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 22,
            paddingBottom: 28,
            gap: 22,
            borderTopWidth: 1,
            borderTopColor: t.rule,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.rule,
              marginBottom: 4,
            }}
          />

          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Visual theme</BTLabel>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(Object.keys(BT_THEMES) as BTThemeKey[]).map((k) => {
                const active = themeKey === k;
                const palette = BT_THEMES[k];
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTheme(k)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: active ? t.surfaceAlt : t.surface,
                      borderWidth: 1,
                      borderColor: active ? t.ink : t.rule,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: palette.bg,
                        borderWidth: 1,
                        borderColor: palette.rule,
                        position: "relative",
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: palette.accent,
                        }}
                      />
                    </View>
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13, textTransform: "capitalize" }}>
                      {k}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <BTRule color={t.rule} />

          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Tilly's tone</BTLabel>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["sibling", "coach", "quiet"] as BTToneKey[]).map((k) => {
                const active = toneKey === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTone(k)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? t.ink : t.rule,
                      backgroundColor: active ? t.surfaceAlt : t.surface,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13 }}>
                      {BT_TONES[k].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <BTRule color={t.rule} />

          <View style={{ gap: 10 }}>
            <BTLabel color={t.inkMute}>Time of day</BTLabel>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["morning", "evening"] as BTTimeOfDay[]).map((k) => {
                const active = time === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTime(k)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? t.ink : t.rule,
                      backgroundColor: active ? t.surfaceAlt : t.surface,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "600", fontSize: 13, textTransform: "capitalize" }}>
                      {k}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
