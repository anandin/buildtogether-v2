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
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { useBT } from "../BTContext";
import { useUser } from "../hooks/useUser";
import { useAuth } from "@/context/AuthContext";
import { useLifeContext, useUpdateLifeContext } from "../hooks/useOnboarding";
import type {
  AgeBand,
  EmploymentType,
  LifeContextInput,
} from "../api/client";
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

        {/* About me — life-context editor. Mirrors the AboutCard in
            onboarding so the user can change what they shared (or fill
            it in if they skipped it). Each save writes a new
            tilly_life_context row (append-only) so Tilly sees the
            update on her next reply. */}
        <AboutMeSection t={t} />

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

/**
 * About me — editable life-context section. Loads the current row and
 * lets the user revise any field. Posts a new row on save (append-only).
 */
function AboutMeSection({ t }: { t: BTTheme }) {
  const lc = useLifeContext();
  const update = useUpdateLifeContext();
  const current = lc.data?.lifeContext ?? null;

  const [employmentType, setEmploymentType] = useState<EmploymentType | undefined>();
  const [ageBand, setAgeBand] = useState<AgeBand | undefined>();
  const [city, setCity] = useState("");
  const [dependents, setDependents] = useState("");
  const [supportNote, setSupportNote] = useState("");
  const [school, setSchool] = useState("");

  // Hydrate fields from the loaded row once it arrives.
  useEffect(() => {
    if (!current) return;
    setEmploymentType((current.employmentType as EmploymentType | null) ?? undefined);
    setAgeBand((current.ageBand as AgeBand | null) ?? undefined);
    setCity(current.city ?? "");
    setDependents(current.dependents != null ? String(current.dependents) : "");
    setSupportNote(current.supportNote ?? "");
    setSchool(current.schoolName ?? "");
  }, [current]);

  const save = () => {
    const body: LifeContextInput = {};
    body.employmentType = employmentType ?? null;
    body.ageBand = ageBand ?? null;
    body.city = city.trim() || null;
    const depN = Number((dependents || "").replace(/[^0-9]/g, ""));
    body.dependents = Number.isFinite(depN) && depN > 0 ? depN : null;
    body.supportNote = supportNote.trim() || null;
    body.schoolName = employmentType === "student" ? school.trim() || null : null;
    update.mutate(body, {
      onSuccess: () => {
        Alert.alert("Saved", "I'll use this from now on.");
      },
      onError: () => {
        Alert.alert("Couldn't save", "Try again in a moment.");
      },
    });
  };

  return (
    <View style={{ gap: 8 }}>
      <BTLabel color={t.inkMute}>About me</BTLabel>
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.rule,
          padding: 14,
          gap: 14,
        }}
      >
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.serifItalic,
            fontSize: 14,
            lineHeight: 21,
          }}
        >
          What you tell me here shapes the advice I give. Everything is
          optional and you can update any of it later.
        </Text>

        <SettingChipRow
          t={t}
          label="What you're doing"
          options={[
            ["student", "Student"],
            ["salaried", "Salaried"],
            ["hourly", "Hourly"],
            ["freelance", "Freelance"],
            ["between_jobs", "Between jobs"],
            ["other", "Other"],
          ] as [EmploymentType, string][]}
          value={employmentType}
          onChange={(v) => setEmploymentType(v ?? undefined)}
        />
        <SettingChipRow
          t={t}
          label="Age range"
          options={[
            ["under_18", "Under 18"],
            ["18_24", "18 — 24"],
            ["25_34", "25 — 34"],
            ["35_44", "35 — 44"],
            ["45_plus", "45+"],
          ] as [AgeBand, string][]}
          value={ageBand}
          onChange={(v) => setAgeBand(v ?? undefined)}
        />
        {employmentType === "student" && (
          <SettingTextInput
            t={t}
            label="Where do you study"
            value={school}
            onChangeText={setSchool}
            placeholder="NYU"
          />
        )}
        <SettingTextInput
          t={t}
          label="City"
          value={city}
          onChangeText={setCity}
          placeholder="Brooklyn"
        />
        <SettingTextInput
          t={t}
          label="People you support (kids, parents)"
          value={dependents}
          onChangeText={setDependents}
          placeholder="0"
          keyboardType="numeric"
        />
        <SettingTextInput
          t={t}
          label="Anything I should know"
          value={supportNote}
          onChangeText={setSupportNote}
          placeholder="Helping mom with rent"
        />

        <Pressable
          onPress={save}
          disabled={update.isPending}
          accessibilityRole="button"
          accessibilityLabel="Save about me"
          style={{
            backgroundColor: update.isPending ? t.surfaceAlt : t.ink,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: update.isPending ? t.inkMute : t.surface,
              fontFamily: BTFonts.sans,
              fontWeight: "700",
              fontSize: 13,
            }}
          >
            {update.isPending ? "Saving…" : "Save about me"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SettingChipRow<T extends string>({
  t,
  label,
  options,
  value,
  onChange,
}: {
  t: BTTheme;
  label: string;
  options: [T, string][];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <BTLabel color={t.inkMute} size={10}>{label}</BTLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map(([k, lbl]) => {
          const active = value === k;
          return (
            <Pressable
              key={k}
              onPress={() => onChange(active ? undefined : k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? t.ink : t.rule,
                backgroundColor: active ? t.ink : "transparent",
              }}
            >
              <Text
                style={{
                  color: active ? t.surface : t.inkSoft,
                  fontFamily: BTFonts.sans,
                  fontSize: 12,
                  fontWeight: active ? "700" : "500",
                }}
              >
                {lbl}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingTextInput({
  t,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  t: BTTheme;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={{ gap: 6 }}>
      <BTLabel color={t.inkMute} size={10}>{label}</BTLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.inkMute}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "numeric" ? "none" : "sentences"}
        style={
          {
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor: t.bg,
            borderWidth: 1,
            borderColor: t.rule,
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 14,
            outlineStyle: "none",
          } as any
        }
      />
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
