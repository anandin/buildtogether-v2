import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";

const PREMIUM_FEATURES = [
  {
    icon: "cpu" as const,
    title: "Dream Guardian AI",
    description: "Self-learning AI that adapts to what motivates you",
  },
  {
    icon: "camera" as const,
    title: "Unlimited Receipt Scans",
    description: "Snap receipts and let AI do the work",
  },
  {
    icon: "trending-up" as const,
    title: "Smart Spending Insights",
    description: "AI-powered analysis of your spending patterns",
  },
  {
    icon: "target" as const,
    title: "Unlimited Dreams",
    description: "Set as many savings goals as you want",
  },
  {
    icon: "eye" as const,
    title: "Guardian Memory",
    description: "See exactly how the AI learns about you",
  },
];

export default function PaywallScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { purchasePremium, restorePurchases, currentOffering, isLoading } = useSubscription();
  
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    
    const success = await purchasePremium();
    
    setIsPurchasing(false);
    
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    
    const success = await restorePurchases();
    
    setIsRestoring(false);
    
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  };

  const price = currentOffering?.product?.priceString || "$6.99";

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <LinearGradient
        colors={[theme.primary + "20", theme.accent + "10", "transparent"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <Pressable 
        style={[styles.closeButton, { top: insets.top + Spacing.md }]} 
        onPress={handleClose}
      >
        <Feather name="x" size={24} color={theme.text} />
      </Pressable>

      <ScrollView 
        contentContainerStyle={[
          styles.content, 
          { 
            paddingTop: insets.top + Spacing["2xl"],
            paddingBottom: insets.bottom + Spacing.xl,
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <Feather name="star" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={styles.badgeText}>PREMIUM</ThemedText>
          </View>
          
          <ThemedText type="h1" style={styles.title}>
            Unlock Dream Guardian
          </ThemedText>
          
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your AI companion that gets smarter the more you use it
          </ThemedText>
        </View>

        <View style={styles.features}>
          {PREMIUM_FEATURES.map((feature, index) => (
            <View 
              key={index} 
              style={[styles.featureRow, { backgroundColor: theme.backgroundSecondary }]}
            >
              <View style={[styles.featureIcon, { backgroundColor: theme.primary + "15" }]}>
                <Feather name={feature.icon} size={20} color={theme.primary} />
              </View>
              <View style={styles.featureContent}>
                <ThemedText type="body" style={styles.featureTitle}>
                  {feature.title}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {feature.description}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.pricingSection}>
          <View style={[styles.pricingCard, { backgroundColor: theme.primary + "10", borderColor: theme.primary }]}>
            <View style={styles.trialBadge}>
              <ThemedText type="small" style={[styles.trialText, { color: theme.primary }]}>
                14-DAY FREE TRIAL
              </ThemedText>
            </View>
            
            <View style={styles.priceRow}>
              <ThemedText type="h1" style={[styles.price, { color: theme.primary }]}>
                {price}
              </ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                /month
              </ThemedText>
            </View>
            
            <ThemedText type="small" style={[styles.priceNote, { color: theme.textSecondary }]}>
              Cancel anytime during trial. No charge until trial ends.
            </ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handlePurchase}
            disabled={isPurchasing || isLoading}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText type="body" style={styles.primaryButtonText}>
                Start Free Trial
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator color={theme.textSecondary} size="small" />
            ) : (
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Restore Purchases
              </ThemedText>
            )}
          </Pressable>
        </View>

        <ThemedText type="small" style={[styles.legal, { color: theme.textSecondary }]}>
          Payment will be charged to your Apple ID or Google Play account. 
          Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
        </ThemedText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  closeButton: {
    position: "absolute",
    right: Spacing.lg,
    zIndex: 10,
    padding: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  badgeText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 280,
  },
  features: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  pricingSection: {
    marginBottom: Spacing.xl,
  },
  pricingCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    alignItems: "center",
  },
  trialBadge: {
    marginBottom: Spacing.sm,
  },
  trialText: {
    fontWeight: "700",
    letterSpacing: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: Spacing.xs,
  },
  price: {
    fontSize: 48,
    fontWeight: "800",
  },
  priceNote: {
    textAlign: "center",
  },
  actions: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 17,
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  legal: {
    textAlign: "center",
    lineHeight: 18,
  },
});
