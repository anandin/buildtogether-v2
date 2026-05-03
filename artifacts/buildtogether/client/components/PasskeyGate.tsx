/**
 * PasskeyGate — modal that handles either passkey enrollment or
 * verification. Used inline before launching Plaid Link, and from the
 * Security settings screen.
 */
import React, { useState } from "react";
import {
  View,
  Modal,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "./ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import {
  enrollPasskey,
  verifyPasskey,
  hasLocalPasskey,
  isPasskeySupported,
} from "@/lib/passkey";

export type PasskeyGateMode = "enroll" | "verify";

interface Props {
  visible: boolean;
  mode: PasskeyGateMode;
  onSuccess: () => void;
  onCancel: () => void;
  reason?: string;
}

export function PasskeyGate({ visible, mode, onSuccess, onCancel, reason }: Props) {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const supported = await isPasskeySupported();
      if (!supported) {
        throw new Error(
          Platform.OS === "web"
            ? "Bank connections require the Tilly mobile app for biometric verification."
            : "Your device doesn't have Face ID, Touch ID, or fingerprint set up. Enable it in your phone Settings, then try again.",
        );
      }
      if (mode === "enroll") {
        await enrollPasskey();
      } else {
        const has = await hasLocalPasskey();
        if (!has) {
          await enrollPasskey();
        } else {
          try {
            await verifyPasskey();
          } catch (vErr: any) {
            // If local meta turned out stale, fall back to fresh enrollment.
            if (String(vErr?.message || "").includes("NO_LOCAL_PASSKEY")) {
              await enrollPasskey();
            } else {
              throw vErr;
            }
          }
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Try again?");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "enroll" ? "Protect your bank with Face ID" : "Verify it's you";
  const body =
    reason ??
    (mode === "enroll"
      ? "Tilly uses your phone's Face ID, Touch ID, or fingerprint as a second factor before connecting a bank. The key never leaves this phone — even Tilly can't see it."
      : "Bank connections need a quick biometric check first. This protects your account if your password is ever leaked.");
  const cta = mode === "enroll" ? "Set up Face ID" : "Verify with Face ID";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.aiLight }]}>
            <Feather name="shield" size={28} color={theme.aiPrimary} />
          </View>
          <ThemedText type="h4" style={{ color: theme.text, textAlign: "center" }}>
            {title}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
            {body}
          </ThemedText>
          {error ? (
            <ThemedText type="tiny" style={{ color: theme.error, textAlign: "center" }}>
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.row}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={[styles.btn, { backgroundColor: theme.backgroundSecondary }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <ThemedText type="small" style={{ color: theme.text }}>Not now</ThemedText>
            </Pressable>
            <Pressable
              onPress={run}
              disabled={busy}
              style={[styles.btn, { backgroundColor: theme.primary }]}
              accessibilityRole="button"
              accessibilityLabel={cta}
              testID="button-passkey-run"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText type="small" style={{ color: "#fff", fontWeight: "600" }}>
                  {cta}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.lg },
  card: {
    width: "100%",
    maxWidth: 420,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: Spacing.sm, width: "100%", marginTop: Spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
});
