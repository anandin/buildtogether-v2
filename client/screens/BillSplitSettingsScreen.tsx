import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { BillSplitPreference, DEFAULT_CATEGORIES, CATEGORY_LABELS } from "@/types";

const BILL_SPLIT_STORAGE_KEY = "@bill_split_preference";

const DEFAULT_SHARED_CATEGORIES = [
  "groceries",
  "restaurants",
  "utilities",
  "internet",
  "home",
  "subscriptions",
];

const DEFAULT_SPLIT_PREFERENCE: BillSplitPreference = {
  splitType: "equal",
  partner1Ratio: 50,
  partner2Ratio: 50,
  sharedCategories: DEFAULT_SHARED_CATEGORIES,
  personalCategories: {
    partner1: [],
    partner2: [],
  },
};

export async function loadBillSplitPreference(): Promise<BillSplitPreference> {
  try {
    const stored = await AsyncStorage.getItem(BILL_SPLIT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Failed to load bill split preference:", error);
  }
  return DEFAULT_SPLIT_PREFERENCE;
}

export async function saveBillSplitPreference(preference: BillSplitPreference): Promise<void> {
  try {
    await AsyncStorage.setItem(BILL_SPLIT_STORAGE_KEY, JSON.stringify(preference));
  } catch (error) {
    console.error("Failed to save bill split preference:", error);
  }
}

type SplitType = "equal" | "income_ratio" | "custom";

export function BillSplitSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { data } = useApp();

  const [preference, setPreference] = useState<BillSplitPreference>(DEFAULT_SPLIT_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBillSplitPreference().then((pref) => {
      setPreference(pref);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveBillSplitPreference(preference);
    setSaving(false);
    navigation.goBack();
  };

  const handleSplitTypeChange = (type: SplitType) => {
    Haptics.selectionAsync();
    if (type === "equal") {
      setPreference({ ...preference, splitType: type, partner1Ratio: 50, partner2Ratio: 50 });
    } else {
      setPreference({ ...preference, splitType: type });
    }
  };

  const handleRatioChange = (partner: "partner1" | "partner2", value: string) => {
    const numValue = Math.min(100, Math.max(0, parseInt(value) || 0));
    if (partner === "partner1") {
      setPreference({
        ...preference,
        partner1Ratio: numValue,
        partner2Ratio: 100 - numValue,
      });
    } else {
      setPreference({
        ...preference,
        partner2Ratio: numValue,
        partner1Ratio: 100 - numValue,
      });
    }
  };

  const toggleSharedCategory = (category: string) => {
    Haptics.selectionAsync();
    const isShared = preference.sharedCategories.includes(category);
    if (isShared) {
      setPreference({
        ...preference,
        sharedCategories: preference.sharedCategories.filter((c) => c !== category),
      });
    } else {
      setPreference({
        ...preference,
        sharedCategories: [...preference.sharedCategories, category],
      });
    }
  };

  const partner1Name = data?.partners.partner1.name || "Partner 1";
  const partner2Name = data?.partners.partner2.name || "Partner 2";

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.loadingContainer}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <ThemedText type="h3">Bill Splitting</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
            Configure how shared expenses are divided between you
          </ThemedText>
        </View>

        <Card style={styles.card}>
          <ThemedText type="heading" style={styles.cardTitle}>Split Method</ThemedText>
          
          <View style={styles.splitOptions}>
            {[
              { type: "equal" as SplitType, label: "Equal (50/50)", icon: "users" as const },
              { type: "income_ratio" as SplitType, label: "By Income", icon: "percent" as const },
              { type: "custom" as SplitType, label: "Custom Ratio", icon: "sliders" as const },
            ].map((option) => (
              <Pressable
                key={option.type}
                onPress={() => handleSplitTypeChange(option.type)}
                style={[
                  styles.splitOption,
                  {
                    backgroundColor: preference.splitType === option.type
                      ? theme.primary + "15"
                      : theme.backgroundSecondary,
                    borderColor: preference.splitType === option.type
                      ? theme.primary
                      : theme.border,
                  },
                ]}
              >
                <Feather
                  name={option.icon}
                  size={20}
                  color={preference.splitType === option.type ? theme.primary : theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  style={{
                    color: preference.splitType === option.type ? theme.primary : theme.text,
                    fontWeight: preference.splitType === option.type ? "600" : "400",
                  }}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          {preference.splitType !== "equal" ? (
            <View style={styles.ratioSection}>
              <View style={styles.ratioRow}>
                <View style={styles.ratioInput}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {partner1Name}
                  </ThemedText>
                  <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={String(preference.partner1Ratio)}
                      onChangeText={(v) => handleRatioChange("partner1", v)}
                      keyboardType="numeric"
                      maxLength={3}
                    />
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>%</ThemedText>
                  </View>
                </View>
                
                <View style={styles.ratioDivider}>
                  <Feather name="minus" size={16} color={theme.textSecondary} />
                </View>
                
                <View style={styles.ratioInput}>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {partner2Name}
                  </ThemedText>
                  <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={String(preference.partner2Ratio)}
                      onChangeText={(v) => handleRatioChange("partner2", v)}
                      keyboardType="numeric"
                      maxLength={3}
                    />
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>%</ThemedText>
                  </View>
                </View>
              </View>
              
              <View style={[styles.ratioBar, { backgroundColor: theme.border }]}>
                <View
                  style={[
                    styles.ratioFill,
                    {
                      width: `${preference.partner1Ratio}%`,
                      backgroundColor: theme.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Card style={styles.card}>
          <ThemedText type="heading" style={styles.cardTitle}>Shared Categories</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
            Expenses in these categories will be split automatically
          </ThemedText>
          
          <View style={styles.categoriesGrid}>
            {DEFAULT_CATEGORIES.map((category) => {
              const isShared = preference.sharedCategories.includes(category);
              const label = CATEGORY_LABELS[category] || category;
              
              return (
                <Pressable
                  key={category}
                  onPress={() => toggleSharedCategory(category)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isShared ? theme.primary + "15" : theme.backgroundSecondary,
                      borderColor: isShared ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Feather
                    name={isShared ? "check" : "plus"}
                    size={14}
                    color={isShared ? theme.primary : theme.textSecondary}
                  />
                  <ThemedText
                    type="small"
                    style={{
                      color: isShared ? theme.primary : theme.text,
                      fontWeight: isShared ? "600" : "400",
                    }}
                  >
                    {label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card style={styles.infoCard}>
          <Feather name="info" size={20} color={theme.primary} />
          <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
            Expenses in shared categories will automatically be split according to your ratio. 
            Personal expenses stay with whoever paid.
          </ThemedText>
        </Card>

        <Button onPress={handleSave} disabled={saving} style={styles.saveButton}>
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSection: {
    marginBottom: Spacing.lg,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    marginBottom: Spacing.md,
  },
  splitOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  splitOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  ratioSection: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  ratioRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratioInput: {
    flex: 1,
    gap: Spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  ratioDivider: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  ratioBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  ratioFill: {
    height: "100%",
    borderRadius: 4,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  infoText: {
    flex: 1,
    lineHeight: 20,
  },
  saveButton: {
    marginBottom: Spacing.xl,
  },
});
