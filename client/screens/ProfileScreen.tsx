import React, { useState } from "react";
import { View, StyleSheet, Image, TextInput, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";

const avatarImages: Record<string, any> = {
  "avatar-preset-1": require("../../assets/images/avatar-preset-1.png"),
  "avatar-preset-2": require("../../assets/images/avatar-preset-2.png"),
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { data, updatePartnerName, setBudget } = useApp();

  const [editingPartner, setEditingPartner] = useState<"partner1" | "partner2" | null>(null);
  const [partnerName, setPartnerName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState(
    data?.budget?.monthlyLimit?.toString() || "2000"
  );

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
        <ThemedText type="heading" style={styles.sectionTitle}>
          Monthly Budget
        </ThemedText>
        <View style={styles.budgetInput}>
          <ThemedText type="h3" style={{ color: theme.textSecondary }}>
            $
          </ThemedText>
          <TextInput
            style={[
              styles.budgetInputField,
              { color: theme.text },
            ]}
            value={budgetAmount}
            onChangeText={setBudgetAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
        <Button onPress={handleSaveBudget} style={styles.saveButton}>
          Update Budget
        </Button>
      </Card>

      <Card style={styles.settingsCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Settings
        </ThemedText>
        
        <Pressable style={styles.settingRow}>
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
  budgetInput: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  budgetInputField: {
    flex: 1,
    fontSize: 32,
    fontWeight: "700",
    marginLeft: Spacing.xs,
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
