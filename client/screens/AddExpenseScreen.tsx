import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ExpenseCategory } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/types";

const categories: ExpenseCategory[] = [
  "food",
  "transport",
  "utilities",
  "entertainment",
  "shopping",
  "health",
  "travel",
  "home",
  "other",
];

const categoryLabels: Record<ExpenseCategory, string> = {
  food: "Food & Dining",
  transport: "Transport",
  utilities: "Utilities",
  entertainment: "Entertainment",
  shopping: "Shopping",
  health: "Health",
  travel: "Travel",
  home: "Home",
  other: "Other",
};

export default function AddExpenseScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { addExpense, data } = useApp();

  const prefilled = route.params?.prefilled;

  const [amount, setAmount] = useState(prefilled?.amount?.toString() || "");
  const [description, setDescription] = useState(prefilled?.description || "");
  const [category, setCategory] = useState<ExpenseCategory>(
    prefilled?.category || "food"
  );
  const [paidBy, setPaidBy] = useState<"partner1" | "partner2">("partner1");
  const [splitMethod, setSplitMethod] = useState<"equal" | "custom" | "single">(
    "equal"
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!description.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await addExpense({
        amount: amountValue,
        description: description.trim(),
        category,
        date: new Date().toISOString(),
        paidBy,
        splitMethod,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.amountContainer}>
        <ThemedText type="h3" style={{ color: theme.textSecondary }}>
          $
        </ThemedText>
        <TextInput
          style={[styles.amountInput, { color: theme.text }]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          autoFocus
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Description
        </ThemedText>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="What was this expense for?"
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Category
        </ThemedText>
        <View style={styles.categoriesGrid}>
          {categories.map((cat) => {
            const isSelected = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => {
                  setCategory(cat);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.categoryButton,
                  {
                    backgroundColor: isSelected
                      ? CATEGORY_COLORS[cat] + "30"
                      : theme.backgroundDefault,
                    borderColor: isSelected ? CATEGORY_COLORS[cat] : theme.border,
                  },
                ]}
              >
                <Feather
                  name={CATEGORY_ICONS[cat] as any}
                  size={20}
                  color={isSelected ? CATEGORY_COLORS[cat] : theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  style={{
                    color: isSelected ? CATEGORY_COLORS[cat] : theme.text,
                    marginTop: 4,
                  }}
                >
                  {categoryLabels[cat]}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Who paid?
        </ThemedText>
        <View style={styles.toggleRow}>
          {(["partner1", "partner2"] as const).map((partner) => (
            <Pressable
              key={partner}
              onPress={() => {
                setPaidBy(partner);
                Haptics.selectionAsync();
              }}
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    paidBy === partner
                      ? theme.primary + "20"
                      : theme.backgroundDefault,
                  borderColor:
                    paidBy === partner ? theme.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                type="body"
                style={{
                  color: paidBy === partner ? theme.primary : theme.text,
                }}
              >
                {data?.partners[partner]?.name || partner}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Split
        </ThemedText>
        <View style={styles.toggleRow}>
          {(
            [
              { key: "equal", label: "50/50", icon: "users" },
              { key: "single", label: "One pays", icon: "user" },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.key}
              onPress={() => {
                setSplitMethod(option.key);
                Haptics.selectionAsync();
              }}
              style={[
                styles.toggleButton,
                {
                  backgroundColor:
                    splitMethod === option.key
                      ? theme.accent + "20"
                      : theme.backgroundDefault,
                  borderColor:
                    splitMethod === option.key ? theme.accent : theme.border,
                },
              ]}
            >
              <Feather
                name={option.icon as any}
                size={16}
                color={splitMethod === option.key ? theme.accent : theme.textSecondary}
                style={{ marginRight: Spacing.xs }}
              />
              <ThemedText
                type="body"
                style={{
                  color: splitMethod === option.key ? theme.accent : theme.text,
                }}
              >
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <Button
        onPress={handleSave}
        disabled={saving || !amount || !description.trim()}
        style={styles.saveButton}
      >
        {saving ? "Saving..." : "Save Expense"}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["3xl"],
  },
  amountInput: {
    fontSize: 48,
    fontWeight: "700",
    minWidth: 100,
    textAlign: "center",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  label: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    fontSize: 16,
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryButton: {
    width: "31%",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  saveButton: {
    marginTop: Spacing.xl,
  },
});
