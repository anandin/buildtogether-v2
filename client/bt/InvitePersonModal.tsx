/**
 * InvitePersonModal — Profile "+ Add someone you trust" target.
 *
 * Collects name + phone (or email) + scope, POSTs to /api/invites which
 * sends an SMS via Twilio (server-side). On success, closes and shows the
 * link in case the user wants to copy it.
 */
import React, { useState } from "react";
import {
  Modal,
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

const SCOPES = [
  { id: "credit_dreams", label: "Credit + dreams", hint: "Sees your big-picture progress." },
  { id: "splits", label: "Splits only", hint: "Just the things you share — rent, groceries." },
  { id: "everything", label: "Everything", hint: "The whole picture. Reserve for someone you'd call at 2am." },
];

export function InvitePersonModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useBT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<string>("splits");
  const [sentLink, setSentLink] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: btApi.invitePerson,
    onSuccess: (data: any) => {
      if (data?.link) setSentLink(data.link);
    },
  });

  const submit = () => {
    if (!name.trim() || (!phone.trim() && !email.trim())) return;
    send.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        scope,
      },
      {
        onSuccess: () => {
          // Defer close so the link can be shown briefly.
          setTimeout(() => {
            setName("");
            setPhone("");
            setEmail("");
            setSentLink(null);
            onClose();
          }, 2200);
        },
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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
            gap: 14,
            maxHeight: "92%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Tilly t={t} size={28} breathing={false} />
            <BTLabel color={t.inkMute}>Trusted people</BTLabel>
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
          <BTSerif size={26} color={t.ink} weight="500">
            Who can{" "}
            <Text style={{ color: t.accent, fontFamily: BTFonts.serifItalic }}>
              help you decide
            </Text>
            ?
          </BTSerif>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 14 }}>
              <Field
                label="Their name"
                value={name}
                onChangeText={setName}
                placeholder="Mom"
              />
              <Field
                label="Phone (texts the invite)"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 123 4567"
                keyboardType="phone-pad"
              />
              <Field
                label="Email (fallback)"
                value={email}
                onChangeText={setEmail}
                placeholder="mom@example.com"
                keyboardType="email-address"
              />

              <View style={{ gap: 8 }}>
                <BTLabel color={t.inkMute}>What can they see?</BTLabel>
                {SCOPES.map((s) => {
                  const active = scope === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setScope(s.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Scope ${s.label}`}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        backgroundColor: active ? t.accentSoft : t.surfaceAlt,
                        borderWidth: 1.5,
                        borderColor: active ? t.accent : "transparent",
                      }}
                    >
                      <Text style={{ color: t.ink, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 13 }}>
                        {s.label}
                      </Text>
                      <Text
                        style={{
                          color: t.inkSoft,
                          fontFamily: BTFonts.sans,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {s.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {sentLink ? (
                <View
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: t.accentSoft,
                    gap: 6,
                  }}
                >
                  <Text style={{ color: t.accent, fontFamily: BTFonts.sans, fontWeight: "700", fontSize: 12 }}>
                    Sent ✓
                  </Text>
                  <Text style={{ color: t.ink, fontFamily: BTFonts.serifItalic, fontSize: 14 }}>
                    They'll get a text in a moment.
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={submit}
                disabled={send.isPending || !name.trim() || (!phone.trim() && !email.trim())}
                accessibilityRole="button"
                accessibilityLabel="Send invite"
                style={{
                  backgroundColor:
                    send.isPending || !name.trim() || (!phone.trim() && !email.trim())
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
                      send.isPending || !name.trim() || (!phone.trim() && !email.trim())
                        ? t.inkMute
                        : t.surface,
                    fontFamily: BTFonts.sans,
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  {send.isPending ? "Sending…" : sentLink ? "Sent" : "Send invite"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  keyboardType?: "default" | "email-address" | "phone-pad";
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
