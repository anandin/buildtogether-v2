import React, { useState, useMemo } from "react";
import { View, StyleSheet, Image, TextInput, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { getCurrentMonthExpenses, getTotalSpent, getEffectiveBudget } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const avatarImages: Record<string, any> = {
  "avatar-preset-1": require("../../assets/images/avatar-preset-1.png"),
  "avatar-preset-2": require("../../assets/images/avatar-preset-2.png"),
};

type ProfileNavigationProp = NativeStackNavigationProp<ProfileStackParamList>;
type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<ProfileNavigationProp>();
  const rootNavigation = useNavigation<RootNavigationProp>();
  const { theme } = useTheme();
  const { data, updatePartnerName, setBudget } = useApp();
  const { user, signOut, deleteAccount } = useAuth();

  const [editingPartner, setEditingPartner] = useState<"partner1" | "partner2" | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState(
    data?.budget?.monthlyLimit?.toString() || "2000"
  );

  const budgetSummary = useMemo(() => {
    if (!data?.categoryBudgets) return { total: 0, spent: 0, categories: 0 };
    const monthlyExpenses = getCurrentMonthExpenses(data.expenses);
    const spent = getTotalSpent(monthlyExpenses);
    const total = data.categoryBudgets.reduce((sum, b) => sum + getEffectiveBudget(b), 0);
    return { total, spent, categories: data.categoryBudgets.length };
  }, [data]);

  const handleEditPartner = (partnerId: "partner1" | "partner2") => {
    setEditingPartner(partnerId);
    setPartnerName(data?.partners[partnerId]?.name || "");
  };

  const handleSavePartnerName = async () => {
    if (editingPartner && partnerName.trim()) {
      await updatePartnerName(editingPartner, partnerName.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setEditingPartner(null);
  };

  const handleSaveBudget = async () => {
    const amount = parseFloat(budgetAmount);
    if (!isNaN(amount) && amount > 0) {
      await setBudget(amount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "All your expenses, savings dreams, and settings will be permanently deleted.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete Everything",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (error) {
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Card style={styles.partnersCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Partners
        </ThemedText>
        
        {(["partner1", "partner2"] as const).map((partnerId) => {
          const partner = data?.partners[partnerId];
          const isEditing = editingPartner === partnerId;

          return (
            <View key={partnerId} style={styles.partnerRow}>
              <Image
                source={
                  avatarImages[partner?.avatar || "avatar-preset-1"] ||
                  avatarImages["avatar-preset-1"]
                }
                style={styles.avatar}
              />
              {isEditing ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={[
                      styles.nameInput,
                      {
                        color: theme.text,
                        backgroundColor: theme.backgroundSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                    value={partnerName}
                    onChangeText={setPartnerName}
                    autoFocus
                    onSubmitEditing={handleSavePartnerName}
                  />
                  <Pressable
                    onPress={handleSavePartnerName}
                    style={[styles.saveButton, { backgroundColor: theme.primary }]}
                  >
                    <Feather name="check" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={styles.partnerInfo}>
                    <ThemedText type="body">{partner?.name}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {partnerId === "partner1" ? "You" : "Your partner"}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => handleEditPartner(partnerId)}
                    hitSlop={8}
                  >
                    <Feather name="edit-2" size={18} color={theme.textSecondary} />
                  </Pressable>
                </>
              )}
            </View>
          );
        })}

        {data?.connectedSince ? (
          <View style={[styles.connectedBadge, { backgroundColor: theme.success + "15" }]}>
            <Feather name="heart" size={14} color={theme.success} />
            <ThemedText type="small" style={{ color: theme.success, marginLeft: Spacing.xs }}>
              Connected since {new Date(data.connectedSince).toLocaleDateString()}
            </ThemedText>
          </View>
        ) : null}
      </Card>

      <Card style={styles.budgetCard}>
        <View style={styles.budgetHeader}>
          <ThemedText type="heading">Category Budgets</ThemedText>
          <Pressable
            onPress={() => navigation.navigate("BudgetSettings")}
            style={[styles.editBudgetButton, { backgroundColor: theme.primary + "15" }]}
          >
            <ThemedText type="small" style={{ color: theme.primary }}>Edit</ThemedText>
          </Pressable>
        </View>
        
        <View style={styles.budgetStats}>
          <View style={styles.budgetStat}>
            <ThemedText type="h2" style={{ color: theme.primary }}>
              ${budgetSummary.total.toFixed(0)}
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Total Budget
            </ThemedText>
          </View>
          <View style={styles.budgetStatDivider} />
          <View style={styles.budgetStat}>
            <ThemedText type="h2">
              ${budgetSummary.spent.toFixed(0)}
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Spent
            </ThemedText>
          </View>
          <View style={styles.budgetStatDivider} />
          <View style={styles.budgetStat}>
            <ThemedText type="h2" style={{ color: budgetSummary.total - budgetSummary.spent >= 0 ? theme.success : theme.error }}>
              ${(budgetSummary.total - budgetSummary.spent).toFixed(0)}
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Remaining
            </ThemedText>
          </View>
        </View>
        
        <Pressable
          onPress={() => navigation.navigate("BudgetSettings")}
          style={[styles.budgetLink, { backgroundColor: theme.backgroundSecondary }]}
        >
          <Feather name="sliders" size={18} color={theme.primary} />
          <View style={styles.budgetLinkText}>
            <ThemedText type="body">Manage {budgetSummary.categories} category budgets</ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Set limits, rollover rules & alerts
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </Card>

      <Card style={styles.settingsCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Settings
        </ThemedText>
        
        <Pressable 
          style={styles.settingRow}
          onPress={() => navigation.navigate("FamilyProfile")}
        >
          <View style={[styles.settingIcon, { backgroundColor: "#6366F1" + "20" }]}>
            <Feather name="users" size={18} color="#6366F1" />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Family Profile</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Family size for personalized insights
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable 
          style={styles.settingRow}
          onPress={() => navigation.navigate("BillSplitSettings")}
        >
          <View style={[styles.settingIcon, { backgroundColor: theme.success + "20" }]}>
            <Feather name="pie-chart" size={18} color={theme.success} />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Bill Splitting</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Configure how expenses are divided
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable 
          style={styles.settingRow}
          onPress={() => navigation.navigate("NotificationSettings")}
        >
          <View style={[styles.settingIcon, { backgroundColor: theme.accent + "20" }]}>
            <Feather name="bell" size={18} color={theme.accent} />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Notifications</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Manage alerts and reminders
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: theme.warning + "20" }]}>
            <Feather name="download" size={18} color={theme.warning} />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Export Data</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Download your expense history
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="help-circle" size={18} color={theme.primary} />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Help & Support</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Get help with the app
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </Card>

      <Card style={styles.settingsCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Partner
        </ThemedText>
        
        <Pressable 
          style={styles.settingRow}
          onPress={() => rootNavigation.navigate("PartnerInvite")}
        >
          <View style={[styles.settingIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="user-plus" size={18} color={theme.primary} />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Connect Partner</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Invite your partner or enter their code
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </Card>

      <Card style={styles.settingsCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Legal
        </ThemedText>
        
        <Pressable 
          style={styles.settingRow}
          onPress={() => rootNavigation.navigate("PrivacyPolicy")}
        >
          <View style={[styles.settingIcon, { backgroundColor: "#8B5CF6" + "20" }]}>
            <Feather name="shield" size={18} color="#8B5CF6" />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Privacy Policy</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              How we protect your data
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable 
          style={styles.settingRow}
          onPress={() => rootNavigation.navigate("TermsOfService")}
        >
          <View style={[styles.settingIcon, { backgroundColor: "#0EA5E9" + "20" }]}>
            <Feather name="file-text" size={18} color="#0EA5E9" />
          </View>
          <View style={styles.settingContent}>
            <ThemedText type="body">Terms of Service</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Usage guidelines and policies
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </Card>

      {user ? (
        <Card style={styles.settingsCard}>
          <ThemedText type="heading" style={styles.sectionTitle}>
            Account
          </ThemedText>
          
          <Pressable 
            style={styles.settingRow}
            onPress={handleSignOut}
          >
            <View style={[styles.settingIcon, { backgroundColor: theme.error + "20" }]}>
              <Feather name="log-out" size={18} color={theme.error} />
            </View>
            <View style={styles.settingContent}>
              <ThemedText type="body" style={{ color: theme.error }}>Sign Out</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {user.email || "Signed in with Apple"}
              </ThemedText>
            </View>
          </Pressable>

          <Pressable 
            style={styles.settingRow}
            onPress={handleDeleteAccount}
          >
            <View style={[styles.settingIcon, { backgroundColor: theme.error + "10" }]}>
              <Feather name="trash-2" size={18} color={theme.error} />
            </View>
            <View style={styles.settingContent}>
              <ThemedText type="body" style={{ color: theme.error }}>Delete Account</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Permanently delete all your data
              </ThemedText>
            </View>
          </Pressable>
        </Card>
      ) : null}

      <ThemedText
        type="small"
        style={[styles.version, { color: theme.textSecondary }]}
      >
        Build Together v1.0.0
      </ThemedText>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  partnersCard: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  partnerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  editContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Spacing.md,
    gap: Spacing.sm,
  },
  nameInput: {
    flex: 1,
    height: 40,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    fontSize: 16,
  },
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  connectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  budgetCard: {
    marginBottom: Spacing.lg,
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  editBudgetButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  budgetStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
  },
  budgetStat: {
    alignItems: "center",
    flex: 1,
  },
  budgetStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  budgetLink: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  budgetLinkText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  settingsCard: {
    marginBottom: Spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  settingContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  version: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
