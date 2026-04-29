/**
 * BTProfile — Tilly's relationship surface. Spec §4.6 + §5.4.
 *
 * The most differentiated screen. The tone tuner has live preview; the notes
 * timeline is Tilly's commitment to remember. Memory · forever — your choice
 * is the row that matters.
 *
 * Real data via /api/tilly/profile + /api/tilly/memory + /api/tilly/tone —
 * no Maya-shaped fallbacks here, just the user's own name, days, trusted
 * people, and notes.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useBT } from "../BTContext";
import { Tilly } from "../Tilly";
import { BTLabel, BTRule, BTSerif } from "../atoms";
import { BT_PULSE_DURATION_MS, BTFonts, type BTTheme } from "../theme";
import { BT_TONES, type BTToneKey } from "../tones";
import { useMemory } from "../hooks/useMemory";
import { useSetTillyTone } from "../hooks/useTillyTone";
import { useProfile } from "../hooks/useProfile";
import { useUser } from "../hooks/useUser";
import { InvitePersonModal } from "../InvitePersonModal";
import { QuietSettingsEditor, type QuietSettingKey } from "../QuietSettingsEditor";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { btApi } from "../api/client";

type QuietRow = { id: QuietSettingKey | "memory_legacy"; label: string };

const QUIET_ROWS: QuietRow[] = [
  { id: "quiet_hours", label: "Quiet hours" },
  { id: "big_purchase", label: "Big-purchase alert" },
  { id: "subscription_scan", label: "Subscription scan" },
  { id: "phishing_watch", label: "Phishing watch" },
  { id: "memory_retention", label: "Memory" },
];

/**
 * Render the live value for a quiet-settings row using the loaded
 * preferences. Falls back to sensible defaults so the row never
 * renders blank during the first load.
 */
function quietValue(
  row: QuietRow,
  s:
    | {
        quietHoursStart?: string;
        quietHoursEnd?: string;
        bigPurchaseThreshold?: number;
        subscriptionScanCadence?: string;
        phishingWatch?: boolean;
        memoryRetention?: string;
      }
    | undefined,
): string {
  if (!s) return "—";
  const fmt12 = (hhmm?: string) => {
    if (!hhmm) return "—";
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(h)) return hhmm;
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = ((h + 11) % 12) + 1;
    const mm = String(m ?? 0).padStart(2, "0");
    return mm === "00" ? `${h12}${ampm}` : `${h12}:${mm}${ampm}`;
  };
  if (row.id === "quiet_hours") return `${fmt12(s.quietHoursStart)} — ${fmt12(s.quietHoursEnd)}`;
  if (row.id === "big_purchase") return `> $${s.bigPurchaseThreshold ?? 25}`;
  if (row.id === "subscription_scan") return s.subscriptionScanCadence ?? "weekly";
  if (row.id === "phishing_watch") return s.phishingWatch === false ? "off" : "on";
  if (row.id === "memory_retention") {
    const m = s.memoryRetention ?? "forever";
    if (m === "forever") return "forever — your choice";
    if (m === "year") return "one year";
    if (m === "month") return "30 days";
    if (m === "session") return "session only";
    return m;
  }
  return "";
}

export function BTProfile() {
  const { t, tone, setTone } = useBT();
  const memory = useMemory();
  const setServerTone = useSetTillyTone();
  const profile = useProfile();
  const { user } = useUser();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [quietOpen, setQuietOpen] = useState<QuietSettingKey | null>(null);
  const { signOut } = useAuth();
  const quiet = useQuery({
    queryKey: ["/api/tilly/quiet"],
    queryFn: btApi.getQuietSettings,
    staleTime: 5 * 60_000,
  });

  const live = profile.data && (profile.data as any).ready === true ? (profile.data as any) : null;
  const userName = live?.name ?? user?.name ?? "You";
  const trusted: { id: string; name: string; scope: string; hue: "accent" | "accent2" | "warn" }[] =
    live?.trusted ?? [];
  const daysWithTilly = live?.daysWithTilly ?? null;
  const studentRole: string | null = live?.studentRole ?? null;

  const liveMemory = memory.data?.memory ?? [];
  const memoryItems = liveMemory.map((m) => ({
    id: m.id,
    date: m.dateLabel,
    body: m.body,
    recent: m.isMostRecent,
  }));

  const handleSetTone = (k: BTToneKey) => {
    setTone(k);
    setServerTone.mutate(k);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 22, paddingTop: 36, paddingBottom: 120, gap: 26 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero "You + Tilly" — soft accent halo behind the pair per design */}
      <View style={{ alignItems: "center", gap: 14, paddingVertical: 12, position: "relative" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -10,
            width: 240,
            height: 240,
            borderRadius: 120,
            backgroundColor: t.accent,
            opacity: 0.12,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, zIndex: 1 }}>
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
            <Text
              style={{
                color: t.ink,
                fontFamily: BTFonts.serif,
                fontSize: 28,
                fontWeight: "500",
              }}
            >
              {userName[0]}
            </Text>
          </View>
          <Text style={{ color: t.inkMute, fontSize: 22, fontFamily: BTFonts.serif }}>+</Text>
          <Tilly t={t} size={64} breathing />
        </View>
        <BTSerif size={26} color={t.ink} weight="500">
          {userName} & Tilly
        </BTSerif>
        {daysWithTilly || studentRole ? (
          <Text
            style={{
              color: t.inkMute,
              fontFamily: BTFonts.mono,
              fontSize: 10,
              letterSpacing: 1.3,
              textTransform: "uppercase",
            }}
          >
            {daysWithTilly ? `${daysWithTilly} day${daysWithTilly === 1 ? "" : "s"}` : ""}
            {daysWithTilly && studentRole ? " · " : ""}
            {studentRole ?? ""}
          </Text>
        ) : null}
      </View>

      {/* Tone tuner */}
      <View style={{ gap: 12 }}>
        <BTLabel color={t.inkMute}>How Tilly talks to you</BTLabel>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: t.surface,
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: t.rule,
          }}
        >
          {(["sibling", "coach", "quiet"] as BTToneKey[]).map((k) => {
            const active = tone.key === k;
            return (
              <Pressable
                key={k}
                onPress={() => handleSetTone(k)}
                accessibilityRole="button"
                accessibilityLabel={`Set tone to ${BT_TONES[k].label}`}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: active ? t.ink : "transparent",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: active ? t.surface : t.inkSoft,
                    fontFamily: BTFonts.sans,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {BT_TONES[k].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            padding: 14,
            backgroundColor: tonePreviewBg(tone.key, t),
            borderRadius: 16,
          }}
        >
          <Tilly t={t} size={32} breathing={false} />
          <Text
            style={{
              flex: 1,
              color: t.ink,
              fontFamily: BTFonts.serifItalic,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {tone.sample}
          </Text>
        </View>
      </View>

      {/* What I've learned about you */}
      <View style={{ gap: 14 }}>
        <BTLabel color={t.inkMute}>What I've learned</BTLabel>
        {memoryItems.length > 0 ? (
          <>
            <BTSerif size={24} color={t.ink} weight="500">
              <Text style={{ fontFamily: BTFonts.serifItalic, color: t.accent }}>
                Tilly's notes,
              </Text>
              {" "}in her own words
            </BTSerif>
            <Timeline t={t} items={memoryItems} />
          </>
        ) : (
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.serifItalic,
              fontSize: 16,
              lineHeight: 24,
            }}
          >
            Once we've talked a bit, I'll start writing down what matters here.
          </Text>
        )}
      </View>

      {/* Trusted people */}
      <View style={{ gap: 10 }}>
        <BTLabel color={t.inkMute}>Trusted people</BTLabel>
        {trusted.map((p) => {
          const c1 =
            p.hue === "accent" ? t.accent : p.hue === "accent2" ? t.accent2 : t.warn;
          // Per design: single-color gradient (color → 53% opacity of itself).
          // The 88-hex-suffix pattern in the spec equals ~53% alpha. Use rgba
          // so it works across web + native consistently.
          const c2 = withAlpha(c1, 0.53);
          return (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 14,
                borderRadius: 14,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.rule,
              }}
            >
              <LinearGradient
                colors={[c1, c2]}
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
                <Text style={{ color: "#fff", fontFamily: BTFonts.serif, fontSize: 18, fontWeight: "600" }}>
                  {p.name[0]}
                </Text>
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 14 }}>
                  {p.name}
                </Text>
                <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 12, marginTop: 2 }}>
                  {scopeLabel(p.scope)}
                </Text>
              </View>
              <Text style={{ color: t.inkMute, fontSize: 18, fontFamily: BTFonts.sans }}>›</Text>
            </View>
          );
        })}
        <Pressable
          onPress={() => setInviteOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Invite someone you trust"
          style={{
            padding: 14,
            borderRadius: 16,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: t.rule,
            alignItems: "center",
          }}
        >
          <Text style={{ color: t.inkSoft, fontFamily: BTFonts.serifItalic, fontSize: 14 }}>
            {trusted.length === 0
              ? "+ Add someone who can help you decide"
              : "+ Invite someone you trust"}
          </Text>
        </Pressable>
      </View>
      <InvitePersonModal visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      <QuietSettingsEditor
        visible={!!quietOpen}
        settingKey={quietOpen}
        onClose={() => setQuietOpen(null)}
      />

      {/* Sign out — quiet, at the very bottom of Profile so it's reachable
          without being prominent. Forgotten how to leave is a worse UX
          than seeing the option. */}
      <Pressable
        onPress={() => signOut().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={{
          alignSelf: "center",
          paddingVertical: 14,
          paddingHorizontal: 18,
          marginTop: 8,
        }}
      >
        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.mono,
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            fontWeight: "700",
          }}
        >
          Sign out
        </Text>
      </Pressable>

      {/* Quiet settings */}
      <View style={{ gap: 8 }}>
        <BTLabel color={t.inkMute}>Quiet settings</BTLabel>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.rule,
            overflow: "hidden",
          }}
        >
          {QUIET_ROWS.map((row, i) => {
            const emphasize = row.id === "memory_retention";
            const value = quietValue(row, quiet.data);
            return (
              <View key={row.id}>
                <Pressable
                  onPress={() => setQuietOpen(row.id as QuietSettingKey)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${row.label}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: t.ink,
                      fontFamily: BTFonts.sans,
                      fontWeight: emphasize ? "700" : "500",
                      fontSize: 13,
                    }}
                  >
                    {row.label}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text
                      style={{
                        color: emphasize ? t.accent : t.inkSoft,
                        fontFamily: emphasize ? BTFonts.serifItalic : BTFonts.mono,
                        fontSize: emphasize ? 14 : 11,
                        letterSpacing: emphasize ? 0 : 0.8,
                        textTransform: emphasize ? "none" : "uppercase",
                      }}
                    >
                      {value}
                    </Text>
                    <Text style={{ color: t.inkMute, fontSize: 14, fontFamily: BTFonts.sans }}>›</Text>
                  </View>
                </Pressable>
                {i < QUIET_ROWS.length - 1 ? <BTRule color={t.rule} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function tonePreviewBg(k: BTToneKey, t: BTTheme): string {
  // Subtle tone-specific tint so the preview card has a visual signature
  // beyond the words changing — sibling = warm/familiar, coach = encouragement
  // green tint, quiet = neutral muted surface.
  if (k === "sibling") return t.accentSoft;
  if (k === "coach") return "rgba(63,135,112,0.12)";
  return t.surfaceAlt;
}

/**
 * Translate the raw scope token (e.g. "credit_dreams") or role string into
 * the human copy the user actually wants to read. Falls through verbatim
 * for unknown values so future scopes still render something legible.
 */
function scopeLabel(scope: string): string {
  switch (scope) {
    case "credit_dreams":
      return "sees credit + dreams";
    case "splits":
      return "splits only — rent, groceries";
    case "everything":
      return "the whole picture";
    case "owner":
      return "you";
    case "trusted_viewer":
      return "view-only";
    case "splitter":
      return "splits only";
    case "family":
      return "family";
    default:
      return scope;
  }
}

/**
 * Pull a CSS rgba() string from a hex (#RRGGBB) plus an alpha 0-1. Used by
 * the trusted-people gradient so we get a single-color fade independent of
 * theme. Hex-with-alpha-suffix doesn't render reliably on RN-web, hence the
 * conversion.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type TimelineItem = { id: string; date: string; body: string; recent?: boolean };

function Timeline({ t, items }: { t: BTTheme; items: TimelineItem[] }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: BT_PULSE_DURATION_MS / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ gap: 0 }}>
      {items.map((m, i) => {
        const last = i === items.length - 1;
        return (
          <View key={m.id} style={{ flexDirection: "row", gap: 14 }}>
            {/* Rail */}
            <View style={{ width: 24, alignItems: "center" }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: m.recent ? t.accent : t.surface,
                  borderWidth: 2,
                  borderColor: m.recent ? t.accent : t.rule,
                  marginTop: 4,
                }}
              />
              {m.recent ? (
                <Animated.View
                  style={{
                    position: "absolute",
                    top: -2,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: t.accent,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] }),
                  }}
                />
              ) : null}
              {!last ? (
                <View style={{ flex: 1, width: 1.5, backgroundColor: t.rule, marginTop: 4 }} />
              ) : null}
            </View>
            {/* Body */}
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18, gap: 6 }}>
              <Text
                style={{
                  color: m.recent ? t.accent : t.inkMute,
                  fontFamily: BTFonts.mono,
                  fontSize: 10,
                  letterSpacing: 1.3,
                  textTransform: "uppercase",
                  fontWeight: "700",
                }}
              >
                {m.date}
              </Text>
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFonts.serifItalic,
                  fontSize: 16,
                  lineHeight: 22,
                }}
              >
                "{m.body}"
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
