/**
 * Plaid Link connector button.
 *
 * Web: dynamically loads Plaid's Link JS from the CDN, opens the modal.
 * Native (iOS/Android): uses react-native-plaid-link-sdk's `create()` +
 *   `open()` to drive the native Plaid Link sheet.
 *
 * Gracefully renders a "coming soon" variant if /api/plaid/status reports
 * the deployment doesn't have Plaid configured.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform, Modal, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  create as plaidCreate,
  open as plaidOpen,
  type LinkSuccess,
  type LinkExit,
} from "react-native-plaid-link-sdk";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

interface Props {
  variant?: "hero" | "inline"; // hero = big CTA card, inline = compact button
  onConnected?: () => void;
}

const PLAID_SCRIPT_URL = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaidScript(): Promise<any> {
  if (Platform.OS !== "web") return Promise.reject(new Error("Not web"));
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  const w = window as any;
  if (w.Plaid) return Promise.resolve(w.Plaid);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PLAID_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Plaid));
      existing.addEventListener("error", () => reject(new Error("Plaid script failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = PLAID_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve((window as any).Plaid);
    script.onerror = () => reject(new Error("Plaid script failed to load"));
    document.body.appendChild(script);
  });
}

export function PlaidConnectButton({ variant = "inline", onConnected }: Props) {
  const { theme } = useTheme();
  // Phase 2 rewires this with React Query invalidation against the BT data layer;
  // for now connecting just fires onConnected and the parent can refetch.
  const refreshData = async () => {};
  const [status, setStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);

  // Check if Plaid is configured on this deployment
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/plaid/status");
        const data = await res.json();
        if (cancelled) return;
        setStatus(data.configured ? "available" : "unavailable");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // First tap shows the disclosure; accepting it launches the actual Link flow.
  const requestLaunch = useCallback(() => {
    if (launching || status !== "available") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    setShowDisclosure(true);
  }, [launching, status]);

  const launch = useCallback(async () => {
    if (launching || status !== "available") return;
    setShowDisclosure(false);
    setLaunching(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Get link token from backend
      const tokenRes = await apiRequest("POST", "/api/plaid/link-token");
      const { linkToken } = await tokenRes.json();
      if (!linkToken) throw new Error("No link token returned");

      if (Platform.OS === "web") {
        // 2a. Web: load Plaid's JS, open modal
        const Plaid = await loadPlaidScript();
        const handler = Plaid.create({
          token: linkToken,
          onSuccess: async (publicToken: string, metadata: any) => {
            try {
              await apiRequest("POST", "/api/plaid/exchange", {
                publicToken,
                institution: metadata?.institution,
              });
              await refreshData();
              onConnected?.();
            } catch (err: any) {
              setError(err.message || "Failed to connect bank");
            } finally {
              setLaunching(false);
            }
          },
          onExit: (err: any) => {
            setLaunching(false);
            if (err) setError(err.display_message || err.error_message || "Connection cancelled");
          },
          onEvent: (eventName: string) => {
            // Useful for debugging: "OPEN", "HANDOFF", "SEARCH_INSTITUTION", etc
            if (process.env.NODE_ENV !== "production") {
              console.log("Plaid event:", eventName);
            }
          },
        });
        handler.open();
      } else {
        // 2b. Native (iOS / Android): use the Plaid Link RN SDK. `create()`
        // initializes the link configuration with the token; `open()` shows
        // the native Plaid sheet and resolves with success or exit.
        plaidCreate({ token: linkToken });
        plaidOpen({
          onSuccess: async (success: LinkSuccess) => {
            try {
              await apiRequest("POST", "/api/plaid/exchange", {
                publicToken: success.publicToken,
                institution: success.metadata?.institution,
              });
              await refreshData();
              onConnected?.();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              setError(err.message || "Failed to connect bank");
            } finally {
              setLaunching(false);
            }
          },
          onExit: (exit: LinkExit) => {
            setLaunching(false);
            if (exit?.error) {
              setError(
                exit.error.displayMessage ||
                  exit.error.errorMessage ||
                  "Connection cancelled",
              );
            }
          },
        });
      }
    } catch (err: any) {
      setError(err.message || "Couldn't start bank connection");
      setLaunching(false);
    }
  }, [launching, status, onConnected, refreshData]);

  if (status === "checking") {
    return (
      <View style={[styles.inline, { backgroundColor: theme.backgroundSecondary }]}>
        <ActivityIndicator size="small" color={theme.textTertiary} />
      </View>
    );
  }

  if (status === "unavailable") {
    if (variant === "hero") {
      return (
        <View style={[styles.hero, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="link-2" size={20} color={theme.textTertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
              Bank sync — coming soon
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Auto-import transactions from 12,000+ banks
            </ThemedText>
          </View>
        </View>
      );
    }
    return null;
  }

  // Privacy disclosure modal, shown once on first tap before launching Plaid
  const disclosureModal = (
    <Modal
      visible={showDisclosure}
      transparent
      animationType="fade"
      onRequestClose={() => setShowDisclosure(false)}
    >
      <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.modalIconWrap, { backgroundColor: theme.aiLight }]}>
            <Feather name="shield" size={24} color={theme.aiPrimary} />
          </View>
          <ThemedText type="h4" style={{ color: theme.text, textAlign: "center" }}>
            Before you connect
          </ThemedText>
          <ScrollView style={styles.modalScroll}>
            <View style={styles.modalRow}>
              <Feather name="eye" size={14} color={theme.textSecondary} style={styles.modalIcon} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>What Plaid sees</ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  Your transactions from the account you connect. Plaid never sees your bank password — you enter it directly with your bank.
                </ThemedText>
              </View>
            </View>
            <View style={styles.modalRow}>
              <Feather name="lock" size={14} color={theme.textSecondary} style={styles.modalIcon} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>What we store</ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  An encrypted access token. Your transactions get mirrored into this app so you can review them. Nothing is shared with third parties.
                </ThemedText>
              </View>
            </View>
            <View style={styles.modalRow}>
              <Feather name="message-circle" size={14} color={theme.textSecondary} style={styles.modalIcon} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>What the Guardian uses</ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  Only the spending data you've accepted — to answer your questions and coach you. Never shared with Plaid or any other party.
                </ThemedText>
              </View>
            </View>
            <View style={styles.modalRow}>
              <Feather name="x-circle" size={14} color={theme.textSecondary} style={styles.modalIcon} />
              <View style={{ flex: 1 }}>
                <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>How to disconnect</ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  Anytime from Settings → Bank connections. Access is revoked with Plaid immediately.
                </ThemedText>
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalButtons}>
            <Pressable
              onPress={() => setShowDisclosure(false)}
              style={[styles.modalButton, { backgroundColor: theme.backgroundSecondary }]}
            >
              <ThemedText type="small" style={{ color: theme.text }}>Not now</ThemedText>
            </Pressable>
            <Pressable
              onPress={launch}
              style={[styles.modalButton, { backgroundColor: theme.primary }]}
              accessibilityLabel="Continue to bank connection"
            >
              <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                I understand, continue
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (variant === "hero") {
    return (
      <>
      <Pressable
        onPress={requestLaunch}
        disabled={launching}
        accessibilityLabel="Connect your bank account"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.hero,
          {
            backgroundColor: theme.aiLight,
            borderColor: theme.aiPrimary + "40",
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: theme.aiPrimary + "20" }]}>
          <Feather name="link-2" size={20} color={theme.aiPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
            Connect your bank
          </ThemedText>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
            Skip manual entry — expenses appear automatically
          </ThemedText>
          {error ? (
            <ThemedText type="tiny" style={{ color: theme.error, marginTop: 4 }}>
              {error}
            </ThemedText>
          ) : null}
        </View>
        {launching ? (
          <ActivityIndicator size="small" color={theme.aiPrimary} />
        ) : (
          <Feather name="chevron-right" size={18} color={theme.aiPrimary} />
        )}
      </Pressable>
      {disclosureModal}
      </>
    );
  }

  return (
    <>
    <Pressable
      onPress={requestLaunch}
      disabled={launching}
      accessibilityLabel="Connect your bank account"
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.inline,
        {
          backgroundColor: theme.primary,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {launching ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <>
          <Feather name="link-2" size={14} color="#FFFFFF" />
          <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
            Connect bank
          </ThemedText>
        </>
      )}
    </Pressable>
    {disclosureModal}
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    minHeight: 36,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: {
    width: "100%",
    maxHeight: 320,
  },
  modalRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  modalIcon: {
    marginTop: 3,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
    marginTop: Spacing.sm,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
