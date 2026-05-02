import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";

interface PremiumGateProps {
  children: React.ReactNode;
  feature: string;
  description?: string;
  compact?: boolean;
  /** "hard" = full lock (default). "soft" = blurred preview with upgrade overlay */
  variant?: "hard" | "soft";
}

export function PremiumGate({ children, feature, description, compact = false, variant = "hard" }: PremiumGateProps) {
  const { isPremium, isLoading } = useSubscription();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  if (isLoading) {
    return null;
  }

  if (isPremium) {
    return <>{children}</>;
  }

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Paywall");
  };

  if (variant === "soft") {
    return (
      <Pressable onPress={handleUpgrade} style={styles.softGateContainer}>
        <View style={styles.softGateContent} pointerEvents="none">
          {children}
        </View>
        <View style={[styles.softGateOverlay, { backgroundColor: theme.background + "E0" }]}>
          <View style={[styles.softGateBadge, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="star" size={20} color={theme.primary} />
            <ThemedText type="small" style={{ fontWeight: "600", color: theme.primary }}>
              {feature}
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Tap to unlock with Premium
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  }

  if (compact) {
    return (
      <Card style={styles.compactCard}>
        <Pressable style={styles.compactContent} onPress={handleUpgrade}>
          <View style={[styles.lockIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="lock" size={16} color={theme.primary} />
          </View>
          <View style={styles.compactText}>
            <ThemedText type="small" style={{ fontWeight: "600" }}>
              {feature}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Unlock with Premium
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </Card>
    );
  }

  return (
    <Card style={styles.gateCard}>
      <View style={[styles.iconContainer, { backgroundColor: theme.primary + "15" }]}>
        <Feather name="star" size={32} color={theme.primary} />
      </View>
      
      <ThemedText type="heading" style={styles.title}>
        {feature}
      </ThemedText>
      
      <ThemedText type="body" style={[styles.description, { color: theme.textSecondary }]}>
        {description || "Upgrade to Premium to unlock this feature"}
      </ThemedText>
      
      <Pressable 
        style={[styles.upgradeButton, { backgroundColor: theme.primary }]}
        onPress={handleUpgrade}
      >
        <ThemedText type="body" style={styles.upgradeText}>
          Start Free Trial
        </ThemedText>
      </Pressable>
      
      <ThemedText type="small" style={[styles.trialNote, { color: theme.textSecondary }]}>
        14-day free trial, then $6.99/month
      </ThemedText>
    </Card>
  );
}

interface PremiumBadgeProps {
  onPress?: () => void;
}

export function PremiumBadge({ onPress }: PremiumBadgeProps) {
  const { theme } = useTheme();
  const { isPremium } = useSubscription();
  const navigation = useNavigation<any>();

  if (isPremium) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      navigation.navigate("Paywall");
    }
  };

  return (
    <Pressable 
      style={[styles.badge, { backgroundColor: theme.primary }]}
      onPress={handlePress}
    >
      <Feather name="star" size={12} color="#FFFFFF" />
      <ThemedText type="small" style={styles.badgeText}>
        PRO
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  softGateContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: BorderRadius.lg,
  },
  softGateContent: {
    opacity: 0.3,
  },
  softGateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  softGateBadge: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  gateCard: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  upgradeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  upgradeText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  trialNote: {
    marginTop: Spacing.sm,
  },
  compactCard: {
    padding: 0,
    overflow: "hidden",
  },
  compactContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  lockIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  compactText: {
    flex: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 10,
  },
});
