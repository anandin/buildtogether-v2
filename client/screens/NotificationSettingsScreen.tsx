import React, { useState, useEffect } from "react";
import { View, StyleSheet, Switch, Pressable, Platform, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { NotificationPreferences } from "@/types/notifications";
import {
  requestNotificationPermissions,
  getNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/types/notifications";

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPermissionsAndLoadPrefs();
  }, []);

  const checkPermissionsAndLoadPrefs = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status, canAskAgain: canAsk } = await Notifications.getPermissionsAsync();
        setHasPermission(status === "granted");
        setCanAskAgain(canAsk);
      } else {
        setHasPermission(false);
      }

      const prefs = await getNotificationPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error("Error checking permissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (!canAskAgain && Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        Alert.alert(
          "Enable Notifications",
          "Please enable notifications in your device settings to receive alerts."
        );
      }
      return;
    }

    const granted = await requestNotificationPermissions();
    setHasPermission(granted);
    
    if (granted) {
      const newPrefs = { ...preferences, enabled: true };
      setPreferences(newPrefs);
      await saveNotificationPreferences(newPrefs);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    await saveNotificationPreferences(newPrefs);
  };

  const renderToggleRow = (
    icon: string,
    iconColor: string,
    title: string,
    description: string,
    key: keyof NotificationPreferences,
    disabled = false
  ) => (
    <View style={[styles.settingRow, disabled && styles.disabledRow]}>
      <View style={[styles.settingIcon, { backgroundColor: iconColor + "20" }]}>
        <Feather name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <ThemedText type="body" style={disabled ? { color: theme.textSecondary } : undefined}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {description}
        </ThemedText>
      </View>
      <Switch
        value={preferences[key] as boolean}
        onValueChange={(value) => handleToggle(key, value)}
        trackColor={{ false: theme.border, true: theme.primary + "80" }}
        thumbColor={preferences[key] ? theme.primary : theme.backgroundDefault}
        disabled={disabled || !hasPermission || !preferences.enabled}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ThemedText type="body">Loading...</ThemedText>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.permissionCard, { paddingTop: headerHeight + Spacing.xl }]}>
          <View style={[styles.permissionIcon, { backgroundColor: theme.warning + "20" }]}>
            <Feather name="smartphone" size={32} color={theme.warning} />
          </View>
          <ThemedText type="heading" style={styles.permissionTitle}>
            Notifications on Mobile
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            Push notifications are only available on mobile devices. Open this app in Expo Go to enable notifications.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      {!hasPermission ? (
        <Card style={styles.permissionCard}>
          <View style={[styles.permissionIcon, { backgroundColor: theme.warning + "20" }]}>
            <Feather name="bell-off" size={32} color={theme.warning} />
          </View>
          <ThemedText type="heading" style={styles.permissionTitle}>
            Enable Notifications
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            Get reminders about budgets, settlements, and dream deposits to stay on track together.
          </ThemedText>
          <Pressable
            style={[styles.permissionButton, { backgroundColor: theme.primary }]}
            onPress={handleRequestPermission}
          >
            <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
              {canAskAgain ? "Enable Notifications" : "Open Settings"}
            </ThemedText>
          </Pressable>
        </Card>
      ) : (
        <>
          <Card style={styles.masterToggle}>
            <View style={styles.masterToggleRow}>
              <View style={[styles.masterIcon, { backgroundColor: theme.primary + "20" }]}>
                <Feather name="bell" size={24} color={theme.primary} />
              </View>
              <View style={styles.masterContent}>
                <ThemedText type="heading">Notifications</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {preferences.enabled ? "Enabled" : "Disabled"}
                </ThemedText>
              </View>
              <Switch
                value={preferences.enabled}
                onValueChange={(value) => handleToggle("enabled", value)}
                trackColor={{ false: theme.border, true: theme.primary + "80" }}
                thumbColor={preferences.enabled ? theme.primary : theme.backgroundDefault}
              />
            </View>
          </Card>

          <ThemedText type="heading" style={styles.sectionTitle}>
            Alert Types
          </ThemedText>

          <Card style={styles.settingsCard}>
            {renderToggleRow(
              "alert-triangle",
              theme.warning,
              "Budget Alerts",
              "Get notified when approaching or exceeding budget limits",
              "budgetAlerts"
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {renderToggleRow(
              "repeat",
              theme.success,
              "Settlement Reminders",
              "Weekly reminders when there's an outstanding balance",
              "settlementReminders"
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {renderToggleRow(
              "star",
              "#6366F1",
              "Dream Deposit Reminders",
              "Gentle nudges after 3+ days without saving",
              "dreamDepositReminders"
            )}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {renderToggleRow(
              "bar-chart-2",
              theme.accent,
              "Weekly Summary",
              "Sunday recap of your spending and savings",
              "weeklySummary"
            )}
          </Card>

          <Card style={styles.infoCard}>
            <Feather name="info" size={18} color={theme.textSecondary} />
            <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
              Notifications help you and your partner stay aligned on your financial journey. We'll never spam you!
            </ThemedText>
          </Card>
        </>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  permissionCard: {
    alignItems: "center",
    padding: Spacing.xl,
    margin: Spacing.lg,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  permissionTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  permissionText: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  masterToggle: {
    marginBottom: Spacing.lg,
  },
  masterToggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  masterIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  masterContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  settingsCard: {
    marginBottom: Spacing.lg,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  disabledRow: {
    opacity: 0.5,
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
    marginRight: Spacing.md,
  },
  divider: {
    height: 1,
    marginLeft: 56,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  infoText: {
    flex: 1,
    lineHeight: 20,
  },
});
