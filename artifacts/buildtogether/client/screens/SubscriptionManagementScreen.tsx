import React from "react";
import { View, StyleSheet, Pressable, Linking, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function SubscriptionManagementScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { 
    isPremium, 
    isPreviewMode, 
    customerInfo, 
    restorePurchases,
    isLoading,
  } = useSubscription();

  const [isRestoring, setIsRestoring] = React.useState(false);

  const handleManageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (Platform.OS === "ios") {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      await Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    await restorePurchases();
    setIsRestoring(false);
  };

  const handleContactSupport = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Linking.openURL("mailto:support@buildtogether.app?subject=Subscription%20Support");
  };

  const getActiveEntitlement = () => {
    if (!customerInfo?.entitlements?.active) return null;
    
    const entitlementKeys = Object.keys(customerInfo.entitlements.active);
    if (entitlementKeys.length === 0) return null;
    
    return customerInfo.entitlements.active[entitlementKeys[0]];
  };

  const activeEntitlement = getActiveEntitlement();

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
        }
      ]}
    >
      <Card style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: isPremium ? theme.success + "20" : theme.warning + "20" }
          ]}>
            <Feather 
              name={isPremium ? "check-circle" : "alert-circle"} 
              size={20} 
              color={isPremium ? theme.success : theme.warning} 
            />
            <ThemedText 
              type="body" 
              style={[
                styles.statusText, 
                { color: isPremium ? theme.success : theme.warning }
              ]}
            >
              {isPremium ? "Premium Active" : "Free Plan"}
            </ThemedText>
          </View>
        </View>

        {isPreviewMode ? (
          <View style={styles.previewNotice}>
            <Feather name="info" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
              Preview mode - No RevenueCat products configured yet
            </ThemedText>
          </View>
        ) : isPremium && activeEntitlement ? (
          <View style={styles.subscriptionDetails}>
            <View style={styles.detailRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Plan
              </ThemedText>
              <ThemedText type="body" style={styles.detailValue}>
                {activeEntitlement.productIdentifier || "Build Together Pro"}
              </ThemedText>
            </View>
            
            {activeEntitlement.expirationDate ? (
              <View style={styles.detailRow}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {activeEntitlement.willRenew ? "Renews" : "Expires"}
                </ThemedText>
                <ThemedText type="body" style={styles.detailValue}>
                  {formatDate(activeEntitlement.expirationDate)}
                </ThemedText>
              </View>
            ) : null}

            {activeEntitlement.isActive && activeEntitlement.periodType === "TRIAL" ? (
              <View style={[styles.trialBadge, { backgroundColor: theme.accent + "20" }]}>
                <Feather name="gift" size={14} color={theme.accent} />
                <ThemedText type="small" style={{ color: theme.accent, fontWeight: "600" }}>
                  Free Trial Active
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.upgradePrompt}>
            <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              Unlock all premium features including Dream Guardian AI
            </ThemedText>
            <Pressable
              style={[styles.upgradeButton, { backgroundColor: theme.primary }]}
              onPress={() => navigation.navigate("Paywall" as never)}
            >
              <ThemedText type="body" style={styles.upgradeButtonText}>
                View Plans
              </ThemedText>
            </Pressable>
          </View>
        )}
      </Card>

      <View style={styles.section}>
        <ThemedText type="h3" style={styles.sectionTitle}>
          Manage Subscription
        </ThemedText>

        <Card 
          style={styles.optionCard}
          onPress={handleManageSubscription}
        >
          <View style={styles.optionContent}>
            <View style={[styles.optionIcon, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="settings" size={20} color={theme.primary} />
            </View>
            <View style={styles.optionText}>
              <ThemedText type="body" style={styles.optionTitle}>
                Manage in {Platform.OS === "ios" ? "App Store" : Platform.OS === "android" ? "Play Store" : "Store"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Change plan, cancel, or update payment
              </ThemedText>
            </View>
            <Feather name="external-link" size={18} color={theme.textSecondary} />
          </View>
        </Card>

        <Card 
          style={styles.optionCard}
          onPress={handleRestore}
        >
          <View style={styles.optionContent}>
            <View style={[styles.optionIcon, { backgroundColor: theme.accent + "15" }]}>
              <Feather name="refresh-cw" size={20} color={theme.accent} />
            </View>
            <View style={styles.optionText}>
              <ThemedText type="body" style={styles.optionTitle}>
                Restore Purchases
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Recover your subscription on this device
              </ThemedText>
            </View>
            {isRestoring ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Feather name="chevron-right" size={18} color={theme.textSecondary} />
            )}
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <ThemedText type="h3" style={styles.sectionTitle}>
          Help & Support
        </ThemedText>

        <Card 
          style={styles.optionCard}
          onPress={handleContactSupport}
        >
          <View style={styles.optionContent}>
            <View style={[styles.optionIcon, { backgroundColor: theme.success + "15" }]}>
              <Feather name="mail" size={20} color={theme.success} />
            </View>
            <View style={styles.optionText}>
              <ThemedText type="body" style={styles.optionTitle}>
                Contact Support
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Get help with billing or subscription issues
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={18} color={theme.textSecondary} />
          </View>
        </Card>
      </View>

      <ThemedText type="small" style={[styles.footerText, { color: theme.textSecondary }]}>
        Subscriptions are managed through {Platform.OS === "ios" ? "Apple" : Platform.OS === "android" ? "Google Play" : "your app store"}. 
        Changes may take a few minutes to reflect in the app.
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  statusCard: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
  },
  statusHeader: {
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  statusText: {
    fontWeight: "700",
  },
  previewNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: BorderRadius.md,
  },
  subscriptionDetails: {
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailValue: {
    fontWeight: "600",
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  upgradePrompt: {
    alignItems: "center",
  },
  upgradeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  upgradeButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  optionCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  footerText: {
    textAlign: "center",
    lineHeight: 18,
    marginTop: Spacing.md,
  },
});
