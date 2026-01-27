import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
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
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ExpenseCategory, SplitMethod } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS, SPLIT_METHODS, DEFAULT_CATEGORIES } from "@/types";
import { getApiUrl } from "@/lib/query-client";

export default function AddExpenseScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { addExpense, data } = useApp();

  const prefilled = route.params?.prefilled;
  const receiptImage = route.params?.receiptImage;

  const [amount, setAmount] = useState(prefilled?.amount?.toString() || "");
  const [description, setDescription] = useState(prefilled?.description || "");
  const [merchant, setMerchant] = useState(prefilled?.merchant || "");
  const [category, setCategory] = useState<ExpenseCategory>(
    prefilled?.category || "groceries"
  );
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState("");
  const [paidBy, setPaidBy] = useState<"partner1" | "partner2" | "joint">("partner1");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(prefilled?.suggestedSplit || "even");
  const [customRatio, setCustomRatio] = useState(50);
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [quickInput, setQuickInput] = useState("");
  const [showQuickInput, setShowQuickInput] = useState(!prefilled && !receiptImage);

  const allCategories = [
    ...DEFAULT_CATEGORIES,
    ...(data?.customCategories?.map(c => c.name) || []),
  ];

  const amountValue = parseFloat(amount) || 0;
  
  const getPartnerShares = () => {
    if (splitMethod === "joint") {
      return { partner1: 0, partner2: 0 };
    }
    if (splitMethod === "single") {
      return paidBy === "partner1" 
        ? { partner1: amountValue, partner2: 0 }
        : { partner1: 0, partner2: amountValue };
    }
    if (splitMethod === "ratio") {
      return {
        partner1: amountValue * (customRatio / 100),
        partner2: amountValue * ((100 - customRatio) / 100),
      };
    }
    return { partner1: amountValue / 2, partner2: amountValue / 2 };
  };

  const shares = getPartnerShares();

  const handleQuickParse = async () => {
    if (!quickInput.trim()) return;
    
    setIsAIProcessing(true);
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/parse-expense", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickInput }),
      });

      if (response.ok) {
        const parsed = await response.json();
        if (parsed.amount) setAmount(parsed.amount.toString());
        if (parsed.merchant) setMerchant(parsed.merchant);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.category) setCategory(parsed.category);
        setShowQuickInput(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Parse error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleSave = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await addExpense({
        amount: amountNum,
        description: description.trim() || merchant || "Expense",
        merchant: merchant.trim() || undefined,
        category,
        date: date.toISOString(),
        paidBy,
        splitMethod,
        splitAmounts: splitMethod !== "joint" ? shares : undefined,
        note: note.trim() || undefined,
        receiptImage: receiptImage || prefilled?.receiptImage,
        isSettled: splitMethod === "joint",
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
      {showQuickInput ? (
        <View style={styles.quickInputSection}>
          <View style={[styles.aiHeader, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="cpu" size={20} color={theme.primary} />
            <ThemedText type="body" style={{ color: theme.primary, flex: 1 }}>
              AI-Powered Entry
            </ThemedText>
          </View>
          
          <ThemedText type="small" style={[styles.quickInputLabel, { color: theme.textSecondary }]}>
            Type naturally and AI will extract the details:
          </ThemedText>
          
          <TextInput
            style={[styles.quickInputField, { 
              backgroundColor: theme.backgroundDefault,
              color: theme.text,
              borderColor: theme.border,
            }]}
            value={quickInput}
            onChangeText={setQuickInput}
            placeholder="e.g., $45 at Trader Joe's for groceries"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={2}
          />
          
          <View style={styles.quickInputActions}>
            <Pressable
              style={[styles.skipButton, { borderColor: theme.border }]}
              onPress={() => setShowQuickInput(false)}
            >
              <ThemedText type="small">Enter Manually</ThemedText>
            </Pressable>
            
            <Pressable
              style={[styles.parseButton, { backgroundColor: theme.primary }]}
              onPress={handleQuickParse}
              disabled={isAIProcessing || !quickInput.trim()}
            >
              {isAIProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="zap" size={16} color="#FFFFFF" />
                  <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                    Parse with AI
                  </ThemedText>
                </>
              )}
            </Pressable>
          </View>
          
          <Pressable
            style={styles.scanReceiptLink}
            onPress={() => navigation.navigate("ScanReceipt")}
          >
            <Feather name="camera" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ color: theme.primary }}>
              Or scan a receipt instead
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.amountSection}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Amount
            </ThemedText>
            <View style={styles.amountRow}>
              <ThemedText type="h1" style={{ color: theme.text }}>$</ThemedText>
              <TextInput
                style={[styles.amountInput, { color: theme.text }]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                autoFocus={!prefilled}
              />
            </View>
          </View>

          {merchant ? (
            <View style={[styles.merchantBadge, { backgroundColor: theme.primary + "15" }]}>
              <Feather name="map-pin" size={14} color={theme.primary} />
              <ThemedText type="body" style={{ color: theme.primary }}>
                {merchant}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.section}>
            <Pressable
              style={[styles.fieldRow, { borderBottomColor: theme.border }]}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <View style={styles.fieldLabel}>
                <Feather name="tag" size={16} color={theme.textSecondary} />
                <ThemedText type="body">Category</ThemedText>
              </View>
              <View style={styles.fieldValue}>
                <View style={[styles.categoryIcon, { backgroundColor: (CATEGORY_COLORS[category] || theme.primary) + "20" }]}>
                  <Feather 
                    name={(CATEGORY_ICONS[category] || "circle") as any} 
                    size={14} 
                    color={CATEGORY_COLORS[category] || theme.primary} 
                  />
                </View>
                <ThemedText type="body">{CATEGORY_LABELS[category] || category}</ThemedText>
                <Feather name="chevron-down" size={16} color={theme.textSecondary} />
              </View>
            </Pressable>

            {showCategoryPicker ? (
              <View style={styles.categoriesGrid}>
                {allCategories.map((cat) => {
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
                            ? (CATEGORY_COLORS[cat] || theme.primary) + "30"
                            : theme.backgroundDefault,
                          borderColor: isSelected ? (CATEGORY_COLORS[cat] || theme.primary) : theme.border,
                        },
                      ]}
                    >
                      <Feather
                        name={(CATEGORY_ICONS[cat] || "circle") as any}
                        size={18}
                        color={isSelected ? (CATEGORY_COLORS[cat] || theme.primary) : theme.textSecondary}
                      />
                      <ThemedText
                        type="tiny"
                        numberOfLines={1}
                        style={{
                          color: isSelected ? (CATEGORY_COLORS[cat] || theme.primary) : theme.text,
                          marginTop: 2,
                        }}
                      >
                        {CATEGORY_LABELS[cat] || cat}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
              <View style={styles.fieldLabel}>
                <Feather name="shopping-bag" size={16} color={theme.textSecondary} />
                <ThemedText type="body">Merchant</ThemedText>
              </View>
              <TextInput
                style={[styles.fieldInput, { color: theme.text }]}
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Store name"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
              <View style={styles.fieldLabel}>
                <Feather name="file-text" size={16} color={theme.textSecondary} />
                <ThemedText type="body">Description</ThemedText>
              </View>
              <TextInput
                style={[styles.fieldInput, { color: theme.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="What was this for?"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <Pressable
              style={[styles.fieldRow, { borderBottomColor: theme.border }]}
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.fieldLabel}>
                <Feather name="calendar" size={16} color={theme.textSecondary} />
                <ThemedText type="body">Date</ThemedText>
              </View>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                {format(date, "MMM d, yyyy")}
              </ThemedText>
            </Pressable>

            {showDatePicker ? (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    setDate(selectedDate);
                  }
                }}
              />
            ) : null}

            <View style={[styles.fieldRow, { borderBottomColor: theme.border }]}>
              <View style={styles.fieldLabel}>
                <Feather name="edit-3" size={16} color={theme.textSecondary} />
                <ThemedText type="body">Note</ThemedText>
              </View>
              <TextInput
                style={[styles.fieldInput, { color: theme.text }]}
                value={note}
                onChangeText={setNote}
                placeholder="Optional note"
                placeholderTextColor={theme.textSecondary}
              />
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              How should we split this?
            </ThemedText>
            
            <View style={styles.splitOptions}>
              {SPLIT_METHODS.map((method) => {
                const isSelected = splitMethod === method.key;
                return (
                  <Pressable
                    key={method.key}
                    onPress={() => {
                      setSplitMethod(method.key);
                      Haptics.selectionAsync();
                    }}
                    style={[
                      styles.splitOption,
                      {
                        backgroundColor: isSelected ? theme.primary + "15" : theme.backgroundDefault,
                        borderColor: isSelected ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.splitRadio, { borderColor: isSelected ? theme.primary : theme.border }]}>
                      {isSelected ? (
                        <View style={[styles.splitRadioInner, { backgroundColor: theme.primary }]} />
                      ) : null}
                    </View>
                    <View style={styles.splitOptionText}>
                      <ThemedText type="body" style={{ fontWeight: isSelected ? "600" : "400" }}>
                        {method.label}
                      </ThemedText>
                      <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                        {method.description}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {splitMethod === "ratio" ? (
              <View style={styles.ratioSlider}>
                <View style={styles.ratioLabels}>
                  <ThemedText type="small" style={{ color: data?.partners.partner1.color }}>
                    {data?.partners.partner1.name}: {customRatio}%
                  </ThemedText>
                  <ThemedText type="small" style={{ color: data?.partners.partner2.color }}>
                    {data?.partners.partner2.name}: {100 - customRatio}%
                  </ThemedText>
                </View>
                <View style={styles.ratioButtons}>
                  {[25, 50, 75].map((ratio) => (
                    <Pressable
                      key={ratio}
                      onPress={() => setCustomRatio(ratio)}
                      style={[
                        styles.ratioButton,
                        {
                          backgroundColor: customRatio === ratio ? theme.primary : theme.backgroundDefault,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <ThemedText 
                        type="small" 
                        style={{ color: customRatio === ratio ? "#FFFFFF" : theme.text }}
                      >
                        {ratio}/{100 - ratio}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {splitMethod !== "joint" ? (
              <View style={styles.paidBySection}>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                  Who paid?
                </ThemedText>
                <View style={styles.paidByOptions}>
                  <Pressable
                    onPress={() => setPaidBy("partner1")}
                    style={[
                      styles.paidByOption,
                      {
                        backgroundColor: paidBy === "partner1" ? data?.partners.partner1.color + "20" : theme.backgroundDefault,
                        borderColor: paidBy === "partner1" ? data?.partners.partner1.color : theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: data?.partners.partner1.color }]}>
                      <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                        {data?.partners.partner1.name?.charAt(0) || "Y"}
                      </ThemedText>
                    </View>
                    <ThemedText type="small">{data?.partners.partner1.name || "You"}</ThemedText>
                  </Pressable>
                  
                  <Pressable
                    onPress={() => setPaidBy("partner2")}
                    style={[
                      styles.paidByOption,
                      {
                        backgroundColor: paidBy === "partner2" ? data?.partners.partner2.color + "20" : theme.backgroundDefault,
                        borderColor: paidBy === "partner2" ? data?.partners.partner2.color : theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: data?.partners.partner2.color }]}>
                      <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                        {data?.partners.partner2.name?.charAt(0) || "P"}
                      </ThemedText>
                    </View>
                    <ThemedText type="small">{data?.partners.partner2.name || "Partner"}</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {amountValue > 0 && splitMethod !== "joint" ? (
              <View style={[styles.splitPreview, { backgroundColor: theme.backgroundDefault }]}>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
                  Split Preview
                </ThemedText>
                <View style={styles.splitPreviewRow}>
                  <View style={styles.splitPreviewPerson}>
                    <View style={[styles.avatarSmall, { backgroundColor: data?.partners.partner1.color }]}>
                      <ThemedText type="tiny" style={{ color: "#FFFFFF" }}>
                        {data?.partners.partner1.name?.charAt(0) || "Y"}
                      </ThemedText>
                    </View>
                    <ThemedText type="body">{data?.partners.partner1.name}</ThemedText>
                  </View>
                  <ThemedText type="h4" style={{ color: theme.primary }}>
                    ${shares.partner1.toFixed(2)}
                  </ThemedText>
                </View>
                <View style={styles.splitPreviewRow}>
                  <View style={styles.splitPreviewPerson}>
                    <View style={[styles.avatarSmall, { backgroundColor: data?.partners.partner2.color }]}>
                      <ThemedText type="tiny" style={{ color: "#FFFFFF" }}>
                        {data?.partners.partner2.name?.charAt(0) || "P"}
                      </ThemedText>
                    </View>
                    <ThemedText type="body">{data?.partners.partner2.name}</ThemedText>
                  </View>
                  <ThemedText type="h4" style={{ color: theme.accent }}>
                    ${shares.partner2.toFixed(2)}
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.cancelButton, { backgroundColor: theme.backgroundSecondary }]}
            >
              <ThemedText type="body">Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !amount || parseFloat(amount) <= 0}
              style={[
                styles.saveButton, 
                { 
                  backgroundColor: theme.primary,
                  opacity: saving || !amount || parseFloat(amount) <= 0 ? 0.5 : 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Save Expense
                </ThemedText>
              )}
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  quickInputSection: {
    gap: Spacing.md,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  quickInputLabel: {
    marginTop: Spacing.md,
  },
  quickInputField: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: "top",
  },
  quickInputActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  skipButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  parseButton: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  scanReceiptLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  amountSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  amountInput: {
    fontSize: 48,
    fontWeight: "700",
    minWidth: 120,
    textAlign: "center",
  },
  merchantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
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
  fieldInput: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
  },
  categoryIcon: {
    width: 24,
    height: 24,
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
  splitOptions: {
    gap: Spacing.sm,
  },
  splitOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  splitRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  splitRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  splitOptionText: {
    flex: 1,
  },
  ratioSlider: {
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  ratioLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  ratioButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ratioButton: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  paidBySection: {
    marginTop: Spacing.lg,
  },
  paidByOptions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  paidByOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  splitPreview: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  splitPreviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  splitPreviewPerson: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  saveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
});
