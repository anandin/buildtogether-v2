/**
 * QuietSettingsEditor — bottom sheet that edits one quiet-setting at a
 * time. Profile renders each row as a Pressable; tapping opens this
 * modal with the right field type. PUT /api/tilly/quiet persists.
 *
 * Field types:
 *   quiet_hours        — two HH:MM time inputs (start / end)
 *   big_purchase       — numeric threshold ($)
 *   subscription_scan  — picker: daily | weekly | monthly | off
 *   phishing_watch     — on / off toggle
 *   memory_retention   — picker: forever | year | month | session
 */
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBT } from "./BTContext";
import { Tilly } from "./Tilly";
import { BTFonts } from "./theme";
import { BTLabel, BTSerif } from "./atoms";
import { btApi } from "./api/client";

export type QuietSettingKey =
  | "quiet_hours"
  | "big_purchase"
  | "subscription_scan"
  | "phishing_watch"
  | "memory_retention";

export function QuietSettingsEditor({
  visible,
  settingKey,
  onClose,
}: {
  visible: boolean;
  settingKey: QuietSettingKey | null;
  onClose: () => void;
}) {
  const { t } = useBT();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["/api/tilly/quiet"],
    queryFn: btApi.getQuietSettings,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: btApi.setQuietSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tilly/quiet"] });
      onClose();
    },
  });

  if (!settingKey) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={onClose}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: t.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 22,
              paddingBottom: 36,
              gap: 16,
              maxHeight: "90%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Tilly t={t} size={28} breathing={false} />
              <BTLabel color={t.inkMute}>Quiet settings</BTLabel>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ padding: 4 }}
              >
                <Text style={{ color: t.inkSoft, fontSize: 20 }}>×</Text>
              </Pressable>
            </View>

            {settings.data ? (
              <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
                {settingKey === "quiet_hours" ? (
                  <QuietHours
                    initial={{
                      start: settings.data.quietHoursStart,
                      end: settings.data.quietHoursEnd,
                    }}
                    onSave={(v) =>
                      save.mutate({ quietHoursStart: v.start, quietHoursEnd: v.end })
                    }
                    saving={save.isPending}
                  />
                ) : null}
                {settingKey === "big_purchase" ? (
                  <BigPurchase
                    initial={settings.data.bigPurchaseThreshold}
                    onSave={(v) => save.mutate({ bigPurchaseThreshold: v })}
                    saving={save.isPending}
                  />
                ) : null}
                {settingKey === "subscription_scan" ? (
                  <Picker
                    label="When should I scan for subscriptions?"
                    options={[
                      { id: "daily", label: "Daily", hint: "Tightest watch — for active accounts" },
                      { id: "weekly", label: "Weekly", hint: "Default. Balanced." },
                      { id: "monthly", label: "Monthly", hint: "Just the basics." },
                      { id: "off", label: "Off", hint: "I won't look. You're driving." },
                    ]}
                    initial={settings.data.subscriptionScanCadence}
                    onSave={(v) => save.mutate({ subscriptionScanCadence: v })}
                    saving={save.isPending}
                  />
                ) : null}
                {settingKey === "phishing_watch" ? (
                  <Toggle
                    label="Phishing watch"
                    body="Watches messages you forward me for known scam patterns. Off by default if you'd rather I stay out of it."
                    initial={settings.data.phishingWatch}
                    onSave={(v) => save.mutate({ phishingWatch: v })}
                    saving={save.isPending}
                  />
                ) : null}
                {settingKey === "memory_retention" ? (
                  <Picker
                    label="How long should I keep my notes?"
                    options={[
                      { id: "forever", label: "Forever — your choice", hint: "I'll keep notes until you ask me to forget." },
                      { id: "year", label: "One year", hint: "Auto-archive after 12 months." },
                      { id: "month", label: "30 days", hint: "Tighter. Useful if you'd rather I not accumulate." },
                      { id: "session", label: "Just this session", hint: "Wipe at sign-out. I'll be a fresh ear every time." },
                    ]}
                    initial={settings.data.memoryRetention}
                    onSave={(v) => save.mutate({ memoryRetention: v })}
                    saving={save.isPending}
                  />
                ) : null}
              </ScrollView>
            ) : (
              <Text style={{ color: t.inkMute, fontFamily: BTFonts.sans, fontSize: 13 }}>
                Loading…
              </Text>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuietHours({
  initial,
  onSave,
  saving,
}: {
  initial: { start: string; end: string };
  onSave: (v: { start: string; end: string }) => void;
  saving: boolean;
}) {
  const { t } = useBT();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const valid = /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end);
  return (
    <View style={{ gap: 14 }}>
      <BTSerif size={22} color={t.ink} weight="500">
        I'll stay quiet from{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          {start} to {end}
        </Text>
        .
      </BTSerif>
      <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 19 }}>
        I won't push notifications during these hours. Use 24-hour time (e.g. 23:00 for 11pm).
      </Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field label="Start" value={start} onChangeText={setStart} placeholder="23:00" />
        <Field label="End" value={end} onChangeText={setEnd} placeholder="07:00" />
      </View>
      <PrimaryButton
        label={saving ? "Saving…" : "Save"}
        onPress={() => onSave({ start, end })}
        disabled={!valid || saving}
      />
    </View>
  );
}

function BigPurchase({
  initial,
  onSave,
  saving,
}: {
  initial: number;
  onSave: (v: number) => void;
  saving: boolean;
}) {
  const { t } = useBT();
  const [value, setValue] = useState(String(initial));
  const num = Number(value.replace(/[^0-9.]/g, ""));
  const valid = num >= 0 && Number.isFinite(num);
  return (
    <View style={{ gap: 14 }}>
      <BTSerif size={22} color={t.ink} weight="500">
        Flag any purchase over{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
          ${num || 0}
        </Text>
        .
      </BTSerif>
      <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 19 }}>
        I'll send a quick heads-up when something larger than this lands. Set to 0 to flag everything,
        or to a high number like 100 to only catch the big-ticket stuff.
      </Text>
      <Field label="Threshold ($)" value={value} onChangeText={setValue} placeholder="25" keyboardType="numeric" />
      <PrimaryButton
        label={saving ? "Saving…" : "Save"}
        onPress={() => onSave(num)}
        disabled={!valid || saving}
      />
    </View>
  );
}

function Picker({
  label,
  options,
  initial,
  onSave,
  saving,
}: {
  label: string;
  options: Array<{ id: string; label: string; hint: string }>;
  initial: string;
  onSave: (v: string) => void;
  saving: boolean;
}) {
  const { t } = useBT();
  const [pick, setPick] = useState(initial);
  return (
    <View style={{ gap: 12 }}>
      <BTSerif size={20} color={t.ink} weight="500" style={{ lineHeight: 26 }}>
        {label}
      </BTSerif>
      {options.map((o) => {
        const active = pick === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => setPick(o.id)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            style={{
              padding: 12,
              borderRadius: 14,
              backgroundColor: active ? t.accentSoft : t.surfaceAlt,
              borderWidth: 1.5,
              borderColor: active ? t.accent : "transparent",
            }}
          >
            <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 13 }}>
              {o.label}
            </Text>
            <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 12, marginTop: 2 }}>
              {o.hint}
            </Text>
          </Pressable>
        );
      })}
      <PrimaryButton
        label={saving ? "Saving…" : "Save"}
        onPress={() => onSave(pick)}
        disabled={pick === initial || saving}
      />
    </View>
  );
}

function Toggle({
  label,
  body,
  initial,
  onSave,
  saving,
}: {
  label: string;
  body: string;
  initial: boolean;
  onSave: (v: boolean) => void;
  saving: boolean;
}) {
  const { t } = useBT();
  const [on, setOn] = useState(initial);
  return (
    <View style={{ gap: 14 }}>
      <BTSerif size={22} color={t.ink} weight="500">
        {label}{" "}
        <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>{on ? "on" : "off"}</Text>
        .
      </BTSerif>
      <Text style={{ color: t.inkSoft, fontFamily: BTFonts.sans, fontSize: 13, lineHeight: 19 }}>
        {body}
      </Text>
      <View
        style={{
          flexDirection: "row",
          backgroundColor: t.surfaceAlt,
          borderRadius: 999,
          padding: 4,
        }}
      >
        {[
          { id: false, label: "Off" },
          { id: true, label: "On" },
        ].map((o) => {
          const active = on === o.id;
          return (
            <Pressable
              key={String(o.id)}
              onPress={() => setOn(o.id)}
              style={{
                flex: 1,
                paddingVertical: 8,
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
                  fontSize: 12,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <PrimaryButton
        label={saving ? "Saving…" : "Save"}
        onPress={() => onSave(on)}
        disabled={on === initial || saving}
      />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  const { t } = useBT();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <BTLabel color={focused ? t.accent : t.inkMute}>{label}</BTLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.inkMute}
        keyboardType={keyboardType ?? "default"}
        style={
          {
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: t.surfaceAlt,
            borderWidth: 1.5,
            borderColor: focused ? t.accent : "transparent",
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 15,
            outlineStyle: "none",
          } as any
        }
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { t } = useBT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        backgroundColor: disabled ? t.surfaceAlt : t.ink,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        marginTop: 4,
      }}
    >
      <Text
        style={{
          color: disabled ? t.inkMute : t.surface,
          fontFamily: BTFonts.sans,
          fontWeight: "700",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
