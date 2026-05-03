/**
 * Inline "Verify Face ID to refresh" banner for Plaid screens.
 *
 * Rendered when the user dismissed the shared PasskeyGate after a 403
 * PASSKEY_STALE — gives them a one-tap way to re-prompt instead of
 * leaving the screen stuck on opaque errors.
 */
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BTFonts, type BTTheme } from "../../theme";

export function PasskeyStaleBanner({
  t,
  label,
  onVerify,
}: {
  t: BTTheme;
  label: string;
  onVerify: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.accent + "55",
        backgroundColor: t.accentSoft,
      }}
    >
      <Feather name="shield" size={18} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: t.ink,
            fontFamily: BTFonts.sans,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: t.inkSoft,
            fontFamily: BTFonts.sans,
            fontSize: 11,
            lineHeight: 16,
            marginTop: 2,
          }}
        >
          Bank access requires a quick biometric check every 12 hours.
        </Text>
      </View>
      <Pressable
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await onVerify();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Verify Face ID"
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: t.ink,
          opacity: pressed ? 0.85 : 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minWidth: 72,
          justifyContent: "center",
        })}
      >
        {busy ? (
          <ActivityIndicator size="small" color={t.surface} />
        ) : (
          <Text
            style={{
              color: t.surface,
              fontFamily: BTFonts.sans,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            Verify
          </Text>
        )}
      </Pressable>
    </View>
  );
}
