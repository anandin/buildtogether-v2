/**
 * Plaid Link connector button.
 *
 * Web: dynamically loads Plaid's Link JS from the CDN, opens the modal.
 * Native: uses react-native-plaid-link-sdk (not installed yet — falls back
 *   to web-browser path if unavailable).
 *
 * Gracefully renders a "coming soon" variant if /api/plaid/status reports
 * the deployment doesn't have Plaid configured.
 */
import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { useApp } from "@/context/AppContext";

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
  const { refreshData } = useApp();
  const [status, setStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const launch = useCallback(async () => {
    if (launching || status !== "available") return;
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
        // 2b. Native: requires react-native-plaid-link-sdk, which isn't
        // installed in this build. Fall back to opening web Link in a browser.
        // TODO: install the SDK once we're ready for native-only features.
        setError("Native Plaid not yet available in this build — use the web app at buildtogether-v2.vercel.app/app to connect a bank");
        setLaunching(false);
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

  if (variant === "hero") {
    return (
      <Pressable
        onPress={launch}
        disabled={launching}
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
    );
  }

  return (
    <Pressable
      onPress={launch}
      disabled={launching}
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
});
