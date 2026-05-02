/**
 * AppSettingsScreen — user-facing controls for the app itself.
 *
 * Splits cleanly from BTProfile (which is about the *relationship* with
 * Tilly: tone, memory, trusted people). This screen is about the app:
 *   - Appearance / theme picker (Bloom / Dusk / Citrus / Neon)
 *   - Notifications status (push token registered? quiet hours pointer)
 *   - Account (email, sign out)
 *   - Subscription management (RevenueCat — pointer only; the management
 *     screen already exists at SubscriptionManagementScreen)
 *   - Legal (privacy, terms — pointers)
 *   - Danger zone (sign out, delete-data hint)
 *
 * Deliberately a single scrollable list of grouped rows. Each row uses the
 * BT design language so the screen feels like part of Tilly, not a
 * settings dump.
 */
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { useBT } from "../BTContext";
import { useUser } from "../hooks/useUser";
import { useAuth } from "@/context/AuthContext";
import { BTLabel, BTRule, BTSerif } from "../atoms";
import { BTFonts, BT_THEMES, type BTTheme, type BTThemeKey } from "../theme";
import { ScreenHeader } from "./plaid/_chrome";

type RowProps = {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
  t: BTTheme;
};

function Row({ icon, label, value, onPress, destructive, right, t }: RowProps) {
  const fg = destructive ? t.bad : t.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        backgroundColor: pressed && onPress ? t.chip : "transparent",
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: destructive ? t.bad + "1A" : t.accentSoft,
        }}
      >
        <Feather name={icon} size={15} color={fg} />
      </View>
      <Text
        style={{
          flex: 1,
          color: fg,
          fontFamily: BTFonts.sans,
          fontWeight: "600",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.mono,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {value}
        </Text>
      ) : null}
      {right}
      {onPress ? (
        <Feather name="chevron-right" size={16} color={t.inkMute} />
      ) : null}
    </Pressable>
  );
}

function Section({
  title,
  t,
  children,
}: {
  title: string;
  t: BTTheme;
  children: React.ReactNode;
}) {
  // Each section is a card; rows separated by hairlines via `divider`.
  const items = React.Children.toArray(children);
  return (
    <View style={{ gap: 8 }}>
      <BTLabel color={t.inkMute}>{title}</BTLabel>
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.rule,
          overflow: "hidden",
        }}
      >
        {items.map((c, i) => (
          <View key={i}>
            {c}
            {i < items.length - 1 ? (
              <View style={{ paddingLeft: 58 }}>
                <BTRule color={t.rule} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function AppSettingsScreen({
  onBack,
  onOpenBankConnections,
  onOpenPending,
}: {
  onBack: () => void;
  onOpenBankConnections: () => void;
  onOpenPending: () => void;
}) {
  const { t, themeKey, setTheme } = useBT();
  const { user } = useUser();
  const { signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert("Sign out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          signOut().catch(() => {});
        },
      },
    ]);
  };

  const handleSupport = () => {
    const url = "mailto:support@buildtogether.app?subject=BuildTogether feedback";
    Linking.openURL(url).catch(() => {
      Alert.alert("No email app", "Reach us at support@buildtogether.app");
    });
  };

  const handleManageSubscription = async () => {
    // OS-managed subscription pages — same approach the V1
    // SubscriptionManagementScreen uses, just inline so we don't need
    // a navigation stack.
    const url =
      Platform.OS === "android"
        ? "https://play.google.com/store/account/subscriptions"
        : "https://apps.apple.com/account/subscriptions";
    Linking.openURL(url).catch(() => {
      Alert.alert(
        "Manage subscription",
        Platform.OS === "android"
          ? "Open Google Play → Subscriptions to manage your plan."
          : "Open Settings → Apple ID → Subscriptions to manage your plan.",
      );
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="App settings" onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ gap: 6 }}>
          <BTSerif size={24} color={t.ink} weight="500">
            Make it{" "}
            <Text style={{ fontFamily: BTFonts.serifItalic, color: t.accent }}>
              yours
            </Text>
          </BTSerif>
          <Text
            style={{
              color: t.inkSoft,
              fontFamily: BTFonts.sans,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            How the app looks, what it imports, who pays for it.
          </Text>
        </View>

        {/* Account */}
        <Section title="Account" t={t}>
          <Row
            t={t}
            icon="mail"
            label="Email"
            value={user?.email ?? "—"}
          />
          <Row
            t={t}
            icon="user"
            label="Name"
            value={user?.name ?? "—"}
          />
        </Section>

        {/* Bank connectivity */}
        <Section title="Bank connectivity" t={t}>
          <Row
            t={t}
            icon="link-2"
            label="Bank connections"
            onPress={onOpenBankConnections}
          />
          <Row
            t={t}
            icon="inbox"
            label="Pending transactions"
            onPress={onOpenPending}
          />
        </Section>

        {/* Appearance */}
        <View style={{ gap: 8 }}>
          <BTLabel color={t.inkMute}>Appearance</BTLabel>
          <View
            style={{
              backgroundColor: t.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: t.rule,
              padding: 12,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 12,
                paddingHorizontal: 4,
              }}
            >
              Theme
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(Object.keys(BT_THEMES) as BTThemeKey[]).map((k) => {
                const tt = BT_THEMES[k];
                const active = themeKey === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setTheme(k)}
                    accessibilityRole="button"
                    accessibilityLabel={`Theme ${k}`}
                    style={({ pressed }) => ({
                      flexBasis: "48%",
                      flexGrow: 1,
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? t.accent : t.rule,
                      backgroundColor: tt.bg,
                      opacity: pressed ? 0.8 : 1,
                      gap: 8,
                    })}
                  >
                    <View style={{ flexDirection: "row", gap: 4 }}>
                      <Swatch color={tt.ink} />
                      <Swatch color={tt.accent} />
                      <Swatch color={tt.accent2} />
                      <Swatch color={tt.surfaceAlt} />
                    </View>
                    <Text
                      style={{
                        color: tt.ink,
                        fontFamily: BTFonts.sans,
                        fontSize: 12,
                        fontWeight: "700",
                        textTransform: "capitalize",
                      }}
                    >
                      {k}
                      {active ? "  ·  on" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Subscription */}
        <Section title="Subscription" t={t}>
          <Row
            t={t}
            icon="star"
            label="Manage subscription"
            onPress={handleManageSubscription}
          />
        </Section>

        {/* Notifications hint — quiet hours live on BTProfile */}
        <Section title="Notifications" t={t}>
          <Row
            t={t}
            icon="bell"
            label="Quiet hours & alerts"
            value="On You tab"
          />
        </Section>

        {/* About / support */}
        <Section title="About" t={t}>
          <Row
            t={t}
            icon="message-square"
            label="Send feedback"
            onPress={handleSupport}
          />
          <Row
            t={t}
            icon="info"
            label="Platform"
            value={Platform.OS}
          />
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" t={t}>
          <Row
            t={t}
            icon="log-out"
            label="Sign out"
            onPress={handleSignOut}
            destructive
          />
        </Section>

        <Text
          style={{
            color: t.inkMute,
            fontFamily: BTFonts.serifItalic,
            fontSize: 12,
            textAlign: "center",
            paddingHorizontal: 12,
            lineHeight: 18,
          }}
        >
          To delete your account or all your data, email
          {" "}support@buildtogether.app and we'll handle it within 7 days.
        </Text>
      </ScrollView>
    </View>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <View
      style={{
        flex: 1,
        height: 14,
        borderRadius: 4,
        backgroundColor: color,
      }}
    />
  );
}
