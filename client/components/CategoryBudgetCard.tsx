import React, { useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS, BUDGET_TYPE_INFO } from "@/types";
import * as storage from "@/lib/cloudStorage";
import { getEffectiveBudget } from "@/lib/cloudStorage";

export function CategoryBudgetCard() {
  const { theme } = useTheme();
  const { data, updateCategoryBudget } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  if (!data) return null;

  const budgetStatus = storage.getCategoryBudgetStatus(data.expenses, data.categoryBudgets).map(b => {
    const budgetConfig = data.categoryBudgets.find(cb => cb.category === b.category);
    const effectiveBudget = budgetConfig ? getEffectiveBudget(budgetConfig) : b.limit;
    const effectivePercentage = effectiveBudget > 0 ? (b.spent / effectiveBudget) * 100 : 0;
    return {
      ...b,
      effectiveBudget,
      effectivePercentage,
      budgetType: budgetConfig?.budgetType || 'recurring',
      rolloverBalance: budgetConfig?.rolloverBalance || 0,
      alertThreshold: budgetConfig?.alertThreshold || 80,
    };
  });
  
  const sortedBudgets = [...budgetStatus].sort((a, b) => b.effectivePercentage - a.effectivePercentage);
  const displayedBudgets = showAll ? sortedBudgets : sortedBudgets.slice(0, 4);
  const overBudgetCount = sortedBudgets.filter(b => b.effectivePercentage >= 100).length;
  const nearBudgetCount = sortedBudgets.filter(b => b.effectivePercentage >= b.alertThreshold && b.effectivePercentage < 100).length;

  const handleEditBudget = (category: string, currentLimit: number) => {
    setEditingCategory(category);
    setEditAmount(currentLimit.toString());
  };

  const handleSaveBudget = async () => {
    if (!editingCategory) return;
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await updateCategoryBudget(editingCategory, { monthlyLimit: amount });
    setEditingCategory(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const getStatusColor = (percentage: number): string => {
    if (percentage >= 100) return theme.error;
    if (percentage >= 80) return theme.warning;
    return theme.success;
  };

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText type="h4">Category Budgets</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {overBudgetCount > 0 
              ? `${overBudgetCount} over budget` 
              : nearBudgetCount > 0 
                ? `${nearBudgetCount} near limit`
                : "All on track"}
          </ThemedText>
        </View>
        <Pressable 
          onPress={() => setShowAll(!showAll)}
          style={[styles.toggleButton, { backgroundColor: theme.backgroundDefault }]}
        >
          <ThemedText type="tiny" style={{ color: theme.primary }}>
            {showAll ? "Show Less" : "Show All"}
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.budgetList}>
        {displayedBudgets.map((budget) => (
          <Pressable
            key={budget.category}
            onPress={() => handleEditBudget(budget.category, budget.limit)}
            style={styles.budgetItem}
          >
            <View style={[
              styles.categoryIcon, 
              { backgroundColor: (CATEGORY_COLORS[budget.category] || theme.primary) + "20" }
            ]}>
              <Feather 
                name={(CATEGORY_ICONS[budget.category] || "circle") as any} 
                size={14} 
                color={CATEGORY_COLORS[budget.category] || theme.primary} 
              />
            </View>
            
            <View style={styles.budgetInfo}>
              <View style={styles.budgetHeader}>
                <View style={styles.categoryNameRow}>
                  <ThemedText type="small">
                    {CATEGORY_LABELS[budget.category] || budget.category}
                  </ThemedText>
                  {budget.budgetType !== 'recurring' ? (
                    <View style={[styles.budgetTypeBadge, { backgroundColor: theme.accent + "20" }]}>
                      <Feather 
                        name={BUDGET_TYPE_INFO[budget.budgetType].icon as any} 
                        size={8} 
                        color={theme.accent} 
                      />
                    </View>
                  ) : null}
                </View>
                <View style={styles.amountRow}>
                  <ThemedText type="small" style={{ color: getStatusColor(budget.effectivePercentage) }}>
                    ${budget.spent.toFixed(0)} / ${budget.effectiveBudget.toFixed(0)}
                  </ThemedText>
                  {budget.rolloverBalance > 0 ? (
                    <ThemedText type="tiny" style={{ color: theme.success, marginLeft: 4 }}>
                      +{budget.rolloverBalance.toFixed(0)}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
              
              <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      backgroundColor: getStatusColor(budget.effectivePercentage),
                      width: `${Math.min(budget.effectivePercentage, 100)}%`,
                    }
                  ]} 
                />
                {budget.alertThreshold < 100 ? (
                  <View 
                    style={[
                      styles.thresholdMarker, 
                      { left: `${budget.alertThreshold}%`, backgroundColor: theme.warning }
                    ]} 
                  />
                ) : null}
              </View>
            </View>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={editingCategory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCategory(null)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setEditingCategory(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Edit {CATEGORY_LABELS[editingCategory || ""] || editingCategory} Budget
            </ThemedText>
            
            <View style={styles.inputRow}>
              <ThemedText type="h3">$</ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                autoFocus
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
              />
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setEditingCategory(null)}
                style={[styles.modalButton, { backgroundColor: theme.backgroundSecondary }]}
              >
                <ThemedText type="body">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={handleSaveBudget}
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
              >
                <ThemedText type="body" style={{ color: "#FFFFFF" }}>Save</ThemedText>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  toggleButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  budgetList: {
    gap: Spacing.sm,
  },
  budgetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  budgetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  categoryNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  budgetTypeBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  thresholdMarker: {
    position: "absolute",
    top: 0,
    width: 2,
    height: "100%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.lg,
  },
  modalTitle: {
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  input: {
    fontSize: 32,
    fontWeight: "600",
    textAlign: "center",
    minWidth: 100,
    borderBottomWidth: 2,
    paddingVertical: Spacing.sm,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
});
