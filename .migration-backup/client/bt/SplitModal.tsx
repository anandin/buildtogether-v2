/**
 * SplitModal — opens from Spend or from a recent expense long-press.
 *
 * Region-aware: defaults to CA (Interac) since the initial user base is
 * Canadian, with a discreet "switch to Venmo (US)" toggle. The Interac
 * flow shows a copy-able recipient block + a tap-to-text SMS button.
 */
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation } from "@tanstack/react-query";

import { useBT } from "./BTContext";
import { Tilly } from "./Tilly";
import { BTFonts } from "./theme";
import { BTLabel, BTSerif } from "./atoms";
import { btApi } from "./api/client";

type Direction = "owed_to_me" | "i_owe";
type Region = "CA" | "US";

export function SplitModal({
  visible,
  onClose,
  prefillAmount,
  prefillLabel,
}: {
  visible: boolean;
  onClose: () => void;
  prefillAmount?: number;
  prefillLabel?: string;
}) {
  const { t } = useBT();
  const [region, setRegion] = useState<Region>("CA");
  const [direction, setDirection] = useState<Direction>("owed_to_me");
  const [recipientName, setRecipientName] = useState("");
  const [recipientContact, setRecipientContact] = useState("");
  const [amount, setAmount] = useState(
    prefillAmount ? prefillAmount.toFixed(2) : "",
  );
  const [label, setLabel] = useState(prefillLabel ?? "");
  const draft = useMutation({ mutationFn: btApi.draftSplit });

  const submit = () => {
    const amt = Number(amount.replace(/[^0-9.]/g, ""));
    if (!recipientName.trim() || !amt || amt <= 0) return;
    const isEmail = recipientContact.includes("@");
    draft.mutate({
      region,
      direction,
      recipient: {
        name: recipientName.trim(),
        email: isEmail ? recipientContact.trim() : undefined,
        phone: isEmail ? undefined : recipientContact.trim() || undefined,
        handle: region === "US" ? recipientContact.trim() : undefined,
      },
      amount: amt,
      label: label.trim() || "Split",
    });
  };

  const reset = () => {
    setRecipientName("");
    setRecipientContact("");
    setAmount("");
    setLabel("");
    draft.reset();
  };

  const result = draft.data;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        onPress={() => {
          reset();
          onClose();
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 22,
            paddingBottom: 36,
            gap: 14,
            maxHeight: "92%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Tilly t={t} size={28} breathing={false} />
            <BTLabel color={t.inkMute}>Split</BTLabel>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => {
                reset();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ padding: 4 }}
            >
              <Text style={{ color: t.inkSoft, fontSize: 20 }}>×</Text>
            </Pressable>
          </View>
          <BTSerif size={26} color={t.ink} weight="500">
            {direction === "owed_to_me" ? (
              <>
                Who{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  owes you
                </Text>
                ?
              </>
            ) : (
              <>
                Who do you{" "}
                <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
                  owe
                </Text>
                ?
              </>
            )}
          </BTSerif>

          <ScrollView style={{ maxHeight: 540 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 14 }}>
              {/* Direction toggle */}
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: t.surfaceAlt,
                  borderRadius: 999,
                  padding: 4,
                }}
              >
                {(
                  [
                    { id: "owed_to_me" as Direction, label: "They owe me" },
                    { id: "i_owe" as Direction, label: "I owe them" },
                  ]
                ).map((d) => {
                  const active = direction === d.id;
                  return (
                    <Pressable
                      key={d.id}
                      onPress={() => setDirection(d.id)}
                      accessibilityRole="button"
                      accessibilityLabel={d.label}
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
                        {d.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Region toggle — small, since most users are one region */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    color: t.inkMute,
                    fontFamily: BTFonts.mono,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  Pay via
                </Text>
                {(["CA", "US"] as Region[]).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRegion(r)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: region === r ? t.accentSoft : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        color: region === r ? t.accent : t.inkMute,
                        fontFamily: BTFonts.sans,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {r === "CA" ? "Interac" : "Venmo"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Field label="Their name" value={recipientName} onChangeText={setRecipientName} placeholder="Priya" />
              <Field
                label={region === "CA" ? "Their email or phone" : "Their Venmo @"}
                value={recipientContact}
                onChangeText={setRecipientContact}
                placeholder={region === "CA" ? "priya@example.com" : "@priya"}
                keyboardType={region === "CA" ? "email-address" : "default"}
              />
              <Field
                label="Amount"
                value={amount}
                onChangeText={setAmount}
                placeholder="40.00"
                keyboardType="numeric"
              />
              <Field
                label="What's it for"
                value={label}
                onChangeText={setLabel}
                placeholder="Trader Joe's groceries"
              />

              {result ? <ResultCard result={result} t={t} region={region} /> : null}

              <Pressable
                onPress={submit}
                disabled={
                  draft.isPending ||
                  !recipientName.trim() ||
                  !amount.trim() ||
                  Number(amount) <= 0
                }
                accessibilityRole="button"
                accessibilityLabel="Draft split"
                style={{
                  backgroundColor:
                    draft.isPending ||
                    !recipientName.trim() ||
                    !amount.trim() ||
                    Number(amount) <= 0
                      ? t.surfaceAlt
                      : t.ink,
                  paddingVertical: 14,
                  borderRadius: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color:
                      draft.isPending ||
                      !recipientName.trim() ||
                      !amount.trim() ||
                      Number(amount) <= 0
                        ? t.inkMute
                        : t.surface,
                    fontFamily: BTFonts.sans,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {draft.isPending
                    ? "Drafting…"
                    : result
                    ? "Draft another"
                    : direction === "owed_to_me"
                    ? "Ask them"
                    : "Set it up"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResultCard({
  result,
  t,
  region,
}: {
  result: any;
  t: import("./theme").BTTheme;
  region: Region;
}) {
  const openSms = () => {
    if (result.smsHref) Linking.openURL(result.smsHref).catch(() => {});
  };
  const openVenmo = () => {
    const url = result.deeplinks?.ios || result.venmoUrl || result.webFallback;
    if (url) Linking.openURL(url).catch(() => {});
  };

  if (region === "CA" && result.flow === "interac") {
    return (
      <View
        style={{
          padding: 14,
          borderRadius: 14,
          backgroundColor: t.accentSoft,
          gap: 10,
        }}
      >
        <BTLabel color={t.accent}>Interac handoff</BTLabel>
        <Text
          style={{
            color: t.ink,
            fontFamily: BTFonts.serifItalic,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {result.message}
        </Text>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 10,
            padding: 12,
            gap: 4,
          }}
        >
          <DetailRow label="To" value={result.bankInstructions?.to ?? ""} t={t} />
          <DetailRow label="Amount" value={result.bankInstructions?.amount ?? ""} t={t} />
          <DetailRow label="Message" value={result.bankInstructions?.message ?? ""} t={t} />
        </View>
        {result.smsHref ? (
          <Pressable
            onPress={openSms}
            accessibilityRole="button"
            accessibilityLabel="Send a text"
            style={{
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: t.accent,
              alignItems: "center",
            }}
          >
            <Text
              style={{ color: "#fff", fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 13 }}
            >
              Send the heads-up text
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  // Venmo
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 14,
        backgroundColor: t.accentSoft,
        gap: 10,
      }}
    >
      <BTLabel color={t.accent}>Venmo handoff</BTLabel>
      <Text style={{ color: t.ink, fontFamily: BTFonts.serifItalic, fontSize: 14 }}>
        {result.message}
      </Text>
      <Pressable
        onPress={openVenmo}
        style={{
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: t.accent,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 13 }}>
          Open Venmo
        </Text>
      </Pressable>
    </View>
  );
}

function DetailRow({
  label,
  value,
  t,
}: {
  label: string;
  value: string;
  t: import("./theme").BTTheme;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text
        style={{
          color: t.inkMute,
          fontFamily: BTFonts.mono,
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: t.ink,
          fontFamily: BTFonts.sans,
          fontSize: 12,
          fontWeight: "600",
          textAlign: "right",
          flex: 1,
        }}
        selectable
      >
        {value}
      </Text>
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
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
}) {
  const { t } = useBT();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <BTLabel color={focused ? t.accent : t.inkMute}>{label}</BTLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.inkMute}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
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
