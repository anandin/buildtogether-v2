import React, { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, Pressable, Share, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";

export default function PartnerInviteScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user, refreshSession } = useAuth();

  const [mode, setMode] = useState<"create" | "join">("create");
  const [inviteCode, setInviteCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkExistingInvite();
  }, [user?.coupleId]);

  const checkExistingInvite = async () => {
    if (!user?.coupleId) return;
    
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(
        new URL(`/api/invite/${user.coupleId}`, apiUrl).toString()
      );
      const data = await response.json();
      
      if (data.hasActiveInvite) {
        setGeneratedCode(data.inviteCode);
      }
    } catch (err) {
      console.error("Check invite error:", err);
    }
  };

  const handleCreateInvite = async () => {
    if (!user?.coupleId || !user?.id) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("POST", "/api/invite/create", {
        coupleId: user.coupleId,
        userId: user.id,
      });
      
      const data = await response.json();
      setGeneratedCode(data.inviteCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Failed to create invite. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWithCode = async () => {
    if (!inviteCode.trim() || !user?.id) return;

    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("POST", "/api/invite/accept", {
        inviteCode: inviteCode.trim().toUpperCase(),
        userId: user.id,
      });
      
      const data = await response.json();
      setSuccess(data.message);
      await refreshSession();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Invalid or expired invite code.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (generatedCode) {
      await Clipboard.setStringAsync(generatedCode);
      Haptics.selectionAsync();
    }
  };

  const handleShareCode = async () => {
    if (!generatedCode) return;

    try {
      await Share.share({
        message: `Join me on Build Together! Use invite code: ${generatedCode}`,
      });
    } catch (err) {
      console.error("Share error:", err);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundRoot,
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="users" size={32} color={theme.primary} />
        </View>
        <ThemedText type="h3">Connect with Partner</ThemedText>
        <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
          Link your accounts to share expenses and save together
        </ThemedText>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[
            styles.tab,
            mode === "create" && { backgroundColor: theme.primary + "15" },
          ]}
          onPress={() => setMode("create")}
        >
          <ThemedText
            type="body"
            style={{
              fontWeight: mode === "create" ? "600" : "400",
              color: mode === "create" ? theme.primary : theme.textSecondary,
            }}
          >
            Invite Partner
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            mode === "join" && { backgroundColor: theme.primary + "15" },
          ]}
          onPress={() => setMode("join")}
        >
          <ThemedText
            type="body"
            style={{
              fontWeight: mode === "join" ? "600" : "400",
              color: mode === "join" ? theme.primary : theme.textSecondary,
            }}
          >
            Join Partner
          </ThemedText>
        </Pressable>
      </View>

      {error ? (
        <Card style={StyleSheet.flatten([styles.messageCard, { borderColor: theme.error }])}>
          <Feather name="alert-circle" size={20} color={theme.error} />
          <ThemedText type="small" style={{ color: theme.error, flex: 1 }}>
            {error}
          </ThemedText>
        </Card>
      ) : null}

      {success ? (
        <Card style={StyleSheet.flatten([styles.messageCard, { borderColor: theme.success }])}>
          <Feather name="check-circle" size={20} color={theme.success} />
          <ThemedText type="small" style={{ color: theme.success, flex: 1 }}>
            {success}
          </ThemedText>
        </Card>
      ) : null}

      {mode === "create" ? (
        <View style={styles.content}>
          {generatedCode ? (
            <Card style={styles.codeCard}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Share this code with your partner
              </ThemedText>
              <View style={styles.codeDisplay}>
                <ThemedText type="h1" style={{ letterSpacing: 4 }}>
                  {generatedCode}
                </ThemedText>
              </View>
              <View style={styles.codeActions}>
                <Pressable
                  style={[styles.codeAction, { backgroundColor: theme.backgroundDefault }]}
                  onPress={handleCopyCode}
                >
                  <Feather name="copy" size={20} color={theme.primary} />
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    Copy
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.codeAction, { backgroundColor: theme.backgroundDefault }]}
                  onPress={handleShareCode}
                >
                  <Feather name="share" size={20} color={theme.primary} />
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    Share
                  </ThemedText>
                </Pressable>
              </View>
              <ThemedText type="tiny" style={{ color: theme.textSecondary, textAlign: "center" }}>
                This code expires in 7 days
              </ThemedText>
            </Card>
          ) : (
            <Card style={styles.createCard}>
              <ThemedText type="body" style={{ textAlign: "center", marginBottom: Spacing.lg }}>
                Generate an invite code for your partner to join your shared account
              </ThemedText>
              <Button onPress={handleCreateInvite} disabled={loading}>
                {loading ? "Generating..." : "Generate Invite Code"}
              </Button>
            </Card>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <Card style={styles.joinCard}>
            <ThemedText type="body" style={{ marginBottom: Spacing.lg }}>
              Enter the 6-character invite code from your partner
            </ThemedText>
            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              value={inviteCode}
              onChangeText={(text) => setInviteCode(text.toUpperCase())}
              placeholder="XXXXXX"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
              maxLength={6}
              textAlign="center"
            />
            <Button onPress={handleJoinWithCode} disabled={loading || inviteCode.length !== 6}>
              {loading ? "Joining..." : "Join Partner"}
            </Button>
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  messageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  content: {
    flex: 1,
  },
  codeCard: {
    alignItems: "center",
    gap: Spacing.md,
  },
  codeDisplay: {
    paddingVertical: Spacing.lg,
  },
  codeActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  codeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  createCard: {
    alignItems: "center",
  },
  joinCard: {
    gap: Spacing.md,
  },
  codeInput: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: 8,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
});
