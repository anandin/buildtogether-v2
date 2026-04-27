/**
 * BTProfile — Tilly's relationship surface. Translated 1:1 from `screens.jsx::BTProfile`.
 *
 * Critical features:
 *   - **Hero pair** — centered, with a 240×240 radial accent halo behind:
 *     User initial avatar (64×64 accentSoft circle, 32px serif) `+` (26px
 *     serif inkMute) `+` Tilly 56 with breathing animation. Then 24px serif
 *     "Maya & Tilly" + caption "247 days · NYU Junior".
 *   - **Tone tuner card** — surface bg, 3-column grid of tone buttons (active
 *     = ink fill, inactive = transparent + ink22 border). Below: a live
 *     preview card with Tilly 22 + italic-serif sample for the *previewed*
 *     tone (independent from global tone, source matches).
 *   - **Tilly's notes timeline** — vertical 2px rail at left=32px, dots at
 *     14×14, recent (i=0) gets accent fill + 5px ring shadow. Each entry:
 *     mono caps date (10px, 0.08em) + italic-serif quote (13px sans).
 *   - **Trusted people** — 3 rows with 38×38 gradient circle avatar (color
 *     → color88), name (14px 600) + role (11px), `›` chevron. Then dashed
 *     "+ Invite someone you trust" tile.
 *   - **Quiet settings** — 5-row simple list with thin dividers, last row
 *     "Memory · forever — your choice" — the trust contract.
 */
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  BT_DATA,
  BT_MEMORIES,
  BT_QUIET_SETTINGS,
  BT_TRUSTED,
} from "../data";
import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BT_TONES, type BTToneKey } from "../tones";
import { BTFonts, type BTTheme } from "../theme";
import { BTLabel, BTSerif } from "../atoms";

export function BTProfile() {
  const { t, toneKey, setTone } = useBT();
  const [previewTone, setPreviewTone] = useState<BTToneKey>(toneKey);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero pair */}
      <View style={{ paddingHorizontal: 22, paddingTop: 32, paddingBottom: 24, alignItems: "center" }}>
        {/* radial halo */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            width: 240,
            height: 240,
            borderRadius: 120,
            backgroundColor: t.accent,
            opacity: 0.2,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: t.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: BTFonts.serif, fontSize: 32, color: t.ink }}>
              {BT_DATA.user.name.charAt(0)}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: BTFonts.serif,
              fontSize: 26,
              color: t.inkMute,
              lineHeight: 26,
            }}
          >
            +
          </Text>
          <Tilly t={t} size={56} state="idle" breathing />
        </View>
        <BTSerif size={24} color={t.ink} style={{ marginBottom: 4 }}>
          {BT_DATA.user.name} & Tilly
        </BTSerif>
        <Text style={{ fontFamily: BTFonts.sans, fontSize: 12, color: t.inkSoft }}>
          247 days · NYU Junior
        </Text>
      </View>

      {/* Tone tuner */}
      <View
        style={{
          marginHorizontal: 22,
          marginBottom: 22,
          padding: 18,
          paddingBottom: 16,
          borderRadius: 18,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.ink + "10",
        }}
      >
        <BTLabel color={t.inkMute} style={{ marginBottom: 12 }}>
          How Tilly talks to you
        </BTLabel>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
          {(Object.keys(BT_TONES) as BTToneKey[]).map((k) => {
            const isActive = previewTone === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  setPreviewTone(k);
                  setTone(k);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 6,
                  borderRadius: 10,
                  backgroundColor: isActive ? t.ink : "transparent",
                  borderWidth: 1,
                  borderColor: isActive ? t.ink : t.ink + "22",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: isActive ? t.bg : t.ink,
                    fontFamily: BTFonts.sans,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {BT_TONES[k].name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: t.bg,
            borderWidth: 1,
            borderColor: t.ink + "14",
            flexDirection: "row",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <View style={{ marginTop: 2 }}>
            <Tilly t={t} size={22} state="idle" />
          </View>
          <Text
            style={{
              flex: 1,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              color: t.ink,
              lineHeight: 18,
              fontStyle: "italic",
            }}
          >
            "{BT_TONES[previewTone].sample}"
          </Text>
        </View>
      </View>

      {/* What I've learned about you */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 8 }}>
        <BTLabel color={t.inkMute} style={{ marginBottom: 4 }}>
          What I've learned about you
        </BTLabel>
        <BTSerif size={22} color={t.ink} style={{ marginBottom: 14, lineHeight: 28 }}>
          <Text style={{ color: t.accent, fontStyle: "italic", fontFamily: BTFonts.serif }}>
            Tilly's notes
          </Text>{" "}
          — a quiet timeline.
        </BTSerif>
      </View>
      <Timeline t={t} />

      {/* Trusted people */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
        <BTLabel color={t.inkMute} style={{ marginBottom: 12 }}>
          Trusted people
        </BTLabel>
        <View style={{ gap: 8 }}>
          {BT_TRUSTED.map((p) => {
            const c1 =
              p.hue === "accent" ? t.accent : p.hue === "accent2" ? t.accent2 : t.warn;
            return (
              <View
                key={p.name}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.ink + "10",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <LinearGradient
                  colors={[c1, c1 + "88"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: BTFonts.serif,
                      fontSize: 18,
                      color: "#fff",
                    }}
                  >
                    {p.name.charAt(0)}
                  </Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: BTFonts.sans,
                      fontSize: 14,
                      fontWeight: "600",
                      color: t.ink,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: BTFonts.sans,
                      fontSize: 11,
                      color: t.inkSoft,
                      marginTop: 2,
                    }}
                  >
                    {p.role}
                  </Text>
                </View>
                <Text style={{ color: t.inkMute, fontSize: 18 }}>›</Text>
              </View>
            );
          })}
          <Pressable
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: t.ink + "33",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: BTFonts.sans,
                fontSize: 12,
                fontWeight: "600",
                color: t.inkSoft,
              }}
            >
              + Invite someone you trust
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Quiet settings */}
      <View style={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <BTLabel color={t.inkMute} style={{ marginBottom: 8 }}>
          Quiet settings
        </BTLabel>
        {BT_QUIET_SETTINGS.map((row, i, a) => (
          <View
            key={row[0]}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 12,
              borderBottomWidth: i < a.length - 1 ? 1 : 0,
              borderBottomColor: t.ink + "14",
            }}
          >
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 13, color: t.ink }}>{row[0]}</Text>
            <Text style={{ fontFamily: BTFonts.sans, fontSize: 12, color: t.inkSoft }}>
              {row[1]} ›
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Timeline({ t }: { t: BTTheme }) {
  return (
    <View style={{ paddingHorizontal: 22, paddingBottom: 22, position: "relative" }}>
      {/* rail */}
      <View
        style={{
          position: "absolute",
          left: 32 + 22,
          top: 8,
          bottom: 8,
          width: 2,
          backgroundColor: t.ink + "1a",
        }}
      />
      {BT_MEMORIES.map((m, i) => (
        <View key={i} style={{ position: "relative", paddingLeft: 38, paddingBottom: 16 }}>
          <View
            style={{
              position: "absolute",
              left: 26,
              top: 4,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: i === 0 ? t.accent : t.bg,
              borderWidth: 2,
              borderColor: i === 0 ? t.accent : t.ink + "33",
            }}
          />
          {i === 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 21,
                top: -1,
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: t.accent + "22",
              }}
            />
          ) : null}
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 10,
              color: t.inkMute,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              fontWeight: "600",
              marginBottom: 4,
            }}
          >
            {m.when}
          </Text>
          <Text
            style={{
              fontFamily: BTFonts.sans,
              fontSize: 13,
              color: t.ink,
              lineHeight: 19,
              fontStyle: "italic",
            }}
          >
            "{m.text}"
          </Text>
        </View>
      ))}
    </View>
  );
}
