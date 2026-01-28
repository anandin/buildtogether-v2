import React, { useState } from "react";
import { View, StyleSheet, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { signInWithApple } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithApple();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Sign in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View 
      style={[
        styles.container, 
        { 
          backgroundColor: theme.backgroundRoot,
          paddingTop: insets.top + Spacing["2xl"],
          paddingBottom: insets.bottom + Spacing["2xl"],
        }
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.logoContainer, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="heart" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h1" style={styles.title}>
          Build Together
        </ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Your personal finance companion{"\n"}that learns what works for you
        </ThemedText>
      </View>

      <View style={styles.features}>
        <FeatureItem 
          icon="cpu" 
          title="AI that knows you"
          description="Learns your habits and gives personalized tips"
          theme={theme}
        />
        <FeatureItem 
          icon="star" 
          title="Shared savings dreams"
          description="Track goals together - from date nights to homes"
          theme={theme}
        />
        <FeatureItem 
          icon="heart" 
          title="Your Dream Guardian"
          description="A friendly owl companion cheering you on"
          theme={theme}
        />
      </View>

      <View style={styles.authSection}>
        {error ? (
          <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
            {error}
          </ThemedText>
        ) : null}

        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={BorderRadius.md}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        ) : (
          <Pressable
            style={[styles.signInButton, { backgroundColor: theme.primary }]}
            onPress={handleAppleSignIn}
            disabled={loading}
          >
            <Feather name="log-in" size={20} color="#FFFFFF" />
            <ThemedText type="body" style={styles.buttonText}>
              {loading ? "Signing in..." : "Continue with Apple"}
            </ThemedText>
          </Pressable>
        )}

        <ThemedText type="tiny" style={[styles.terms, { color: theme.textSecondary }]}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </ThemedText>
      </View>
    </View>
  );
}

function FeatureItem({ 
  icon, 
  title, 
  description,
  theme,
}: { 
  icon: keyof typeof Feather.glyphMap; 
  title: string; 
  description: string;
  theme: any;
}) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: theme.primary + "15" }]}>
        <Feather name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.featureText}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {description}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 24,
  },
  features: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.lg,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  authSection: {
    gap: Spacing.md,
  },
  error: {
    textAlign: "center",
  },
  appleButton: {
    width: "100%",
    height: 50,
  },
  signInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 50,
    borderRadius: BorderRadius.md,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  terms: {
    textAlign: "center",
    lineHeight: 18,
  },
});
