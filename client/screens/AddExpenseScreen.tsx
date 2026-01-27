import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ExpenseCategory, SplitMethod } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS, SPLIT_METHODS } from "@/types";

const categories: ExpenseCategory[] = [
  "groceries",
  "restaurants",
  "utilities",
  "internet",
  "transport",
  "entertainment",
  "shopping",
  "health",
  "travel",
  "home",
  "food",
  "other",
];

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
    prefilled?.category || "groceries"
  );
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState("");
  const [paidBy, setPaidBy] = useState<"partner1" | "partner2" | "joint">("partner1");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("even");
  const [isRecurring, setIsRecurring] = useState(false);
  const [divideExpense, setDivideExpense] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const amountValue = parseFloat(amount) || 0;
  const partner1Share = divideExpense ? amountValue / 2 : (paidBy === "partner1" ? amountValue : 0);
  const partner2Share = divideExpense ? amountValue / 2 : (paidBy === "partner2" ? amountValue : 0);

  const handleSave = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
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
        amount: amountNum,
        description: description.trim(),
        category,
        date: date.toISOString(),
        paidBy,
        splitMethod: divideExpense ? splitMethod : "single",
        splitAmounts: divideExpense ? { partner1: partner1Share, partner2: partner2Share } : undefined,
        note: note.trim() || undefined,
        isRecurring,
        isSettled: false,
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
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.amountRow}>
        <ThemedText type="body">Amount</ThemedText>
        <View style={styles.amountInputContainer}>
          <ThemedText type="h2" style={{ color: theme.text }}>$</ThemedText>
          <TextInput
            style={[styles.amountInput, { color: theme.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      {prefilled?.receiptImage ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              Receipt Image
            </ThemedText>
            <View style={styles.aiToggle}>
              <ThemedText type="tiny" style={{ color: theme.primary }}>
                AI Auto-Fill
              </ThemedText>
              <Switch
                value={true}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
          <Image
            source={{ uri: prefilled.receiptImage }}
            style={styles.receiptImage}
            resizeMode="contain"
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <ThemedText type="small" style={{ color: theme.primary, marginBottom: Spacing.sm }}>
          What kind of expense?
        </ThemedText>
        
        <Pressable
          style={[styles.fieldRow, { borderBottomColor: theme.border }]}
          onPress={() => setShowCategoryPicker(!showCategoryPicker)}
        >
          <View style={styles.fieldLabel}>
            <ThemedText type="body">Category</ThemedText>
            <Feather name="edit-2" size={14} color={theme.textSecondary} />
          </View>
          <View style={styles.fieldValue}>
            <View style={[styles.categoryIcon, { backgroundColor: CATEGORY_COLORS[category] + "20" }]}>
              <Feather name={CATEGORY_ICONS[category] as any} size={16} color={CATEGORY_COLORS[category]} />
            </View>
            <ThemedText type="body">{CATEGORY_LABELS[category]}</ThemedText>
          </View>
        </Pressable>

        {showCategoryPicker ? (
          <View style={styles.categoriesGrid}>
            {categories.map((cat) => {
              const isSelected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => {
                    setCategory(cat);
                    setShowCategoryPicker(false);
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
                    size={18}
                    color={isSelected ? CATEGORY_COLORS[cat] : theme.textSecondary}
                  />
                  <ThemedText
                    type="tiny"
                    numberOfLines={1}
                    style={{
                      color: isSelected ? CATEGORY_COLORS[cat] : theme.text,
                      marginTop: 2,
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          style={[styles.fieldRow, { borderBottomColor: theme.border }]}
          onPress={() => setShowDatePicker(true)}
        >
          <ThemedText type="body">Day</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {format(date, "EEE, yyyy-MM-dd")}
          </ThemedText>
        </Pressable>

        {showDatePicker ? (
          <DateTimePicker
            value={date}
            mode="date"
            display="spinner"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setDate(selectedDate);
              }
            }}
          />
        ) : null}

        <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
          <ThemedText type="body">Note</ThemedText>
          <TextInput
            style={[styles.noteInput, { color: theme.text }]}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note..."
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
          <ThemedText type="body">Recurring</ThemedText>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
          <ThemedText type="body">Divide the Expense</ThemedText>
          <Switch
            value={divideExpense}
            onValueChange={setDivideExpense}
            trackColor={{ false: theme.border, true: theme.success }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {divideExpense ? (
        <View style={styles.section}>
          <ThemedText type="small" style={{ color: theme.primary, marginBottom: Spacing.sm }}>
            How should we divide this?
          </ThemedText>

          <View style={styles.splitOptionsRow}>
            <ThemedText type="body">Split</ThemedText>
            <View style={styles.splitButtons}>
              {SPLIT_METHODS.map((method) => (
                <Pressable
                  key={method.key}
                  onPress={() => {
                    setSplitMethod(method.key);
                    Haptics.selectionAsync();
                  }}
                  style={[
                    styles.splitButton,
                    {
                      backgroundColor:
                        splitMethod === method.key
                          ? theme.backgroundDefault
                          : "transparent",
                      borderColor:
                        splitMethod === method.key ? theme.border : "transparent",
                    },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={{
                      color: splitMethod === method.key ? theme.text : theme.textSecondary,
                    }}
                  >
                    {method.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.partnerSplits}>
            <View style={styles.partnerSplitRow}>
              <View style={styles.partnerInfo}>
                <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner1.color || theme.primary }]}>
                  <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                    {data?.partners.partner1.name?.charAt(0) || "Y"}
                  </ThemedText>
                </View>
                <ThemedText type="body">{data?.partners.partner1.name || "You"}</ThemedText>
              </View>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                ${partner1Share.toFixed(2)}
              </ThemedText>
            </View>
            <View style={styles.partnerSplitRow}>
              <View style={styles.partnerInfo}>
                <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner2.color || theme.accent }]}>
                  <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                    {data?.partners.partner2.name?.charAt(0) || "P"}
                  </ThemedText>
                </View>
                <ThemedText type="body">{data?.partners.partner2.name || "Partner"}</ThemedText>
              </View>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                ${partner2Share.toFixed(2)}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <Button
          onPress={() => navigation.goBack()}
          style={[styles.cancelButton, { backgroundColor: theme.backgroundSecondary }]}
        >
          <ThemedText type="body">Close</ThemedText>
        </Button>
        <Button
          onPress={handleSave}
          disabled={saving || !amount || !description.trim()}
          style={styles.saveButton}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  amountInputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "700",
    minWidth: 100,
    textAlign: "right",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  aiToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  receiptImage: {
    width: "100%",
    height: 200,
    borderRadius: BorderRadius.md,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  fieldLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  fieldValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  categoryButton: {
    width: "23%",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  noteInput: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
  },
  splitOptionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  splitButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  splitButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  partnerSplits: {
    gap: Spacing.md,
  },
  partnerSplitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  partnerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  partnerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});
