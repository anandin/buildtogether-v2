import React, { useState, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, TextInput, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getSpendingByCategory, getEffectiveBudget } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { CategoryBudget, BudgetType } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS, BUDGET_TYPE_INFO } from "@/types";

export default function BudgetSettingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { data, updateCategoryBudget, processMonthlyRollover } = useApp();
  
  const [editingBudget, setEditingBudget] = useState<CategoryBudget | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<BudgetType>("recurring");
  const [editThreshold, setEditThreshold] = useState("80");

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const spendingByCategory = getSpendingByCategory(currentMonthExpenses);

  const budgetStats = useMemo(() => {
    if (!data?.categoryBudgets) return { total: 0, used: 0, remaining: 0, potentialSavings: 0 };
    
    let total = 0;
    let used = 0;
    
    data.categoryBudgets.forEach((budget) => {
      const effective = getEffectiveBudget(budget);
      total += effective;
      used += spendingByCategory[budget.category] || 0;
    });
    
    return {
      total,
      used,
      remaining: total - used,
      potentialSavings: Math.max(0, total - used),
    };
  }, [data?.categoryBudgets, spendingByCategory]);

  const handleEditBudget = (budget: CategoryBudget) => {
    setEditingBudget(budget);
    setEditAmount(budget.monthlyLimit.toString());
    setEditType(budget.budgetType);
    setEditThreshold(budget.alertThreshold.toString());
  };

  const handleSaveBudget = async () => {
    if (!editingBudget) return;
    
    const amount = parseFloat(editAmount);
    const threshold = parseInt(editThreshold, 10);
    
    if (!isNaN(amount) && amount > 0) {
      await updateCategoryBudget(editingBudget.category, {
        monthlyLimit: amount,
        budgetType: editType,
        alertThreshold: isNaN(threshold) ? 80 : Math.min(100, Math.max(50, threshold)),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingBudget(null);
    }
  };

  const getCategoryDisplay = (categoryId: string) => {
    const customCategory = data?.customCategories.find((c) => c.id === categoryId);
    if (customCategory) {
      return {
        name: customCategory.name,
        icon: customCategory.icon,
        color: customCategory.color,
      };
    }
    return {
      name: CATEGORY_LABELS[categoryId] || categoryId,
      icon: CATEGORY_ICONS[categoryId] || "circle",
      color: CATEGORY_COLORS[categoryId] || theme.primary,
    };
  };

  const renderBudgetCard = (budget: CategoryBudget) => {
    const spent = spendingByCategory[budget.category] || 0;
    const effectiveBudget = getEffectiveBudget(budget);
    const percentage = effectiveBudget > 0 ? (spent / effectiveBudget) * 100 : 0;
    const isOverBudget = percentage > 100;
    const isNearLimit = percentage >= budget.alertThreshold;
    
    const statusColor = isOverBudget 
      ? theme.error 
      : isNearLimit 
        ? theme.warning 
        : theme.success;

    const categoryDisplay = getCategoryDisplay(budget.category);

    return (
      <Pressable
        key={budget.id}
        onPress={() => handleEditBudget(budget)}
        style={({ pressed }) => [
          styles.budgetCard,
          {
            backgroundColor: theme.backgroundDefault,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View style={styles.budgetHeader}>
          <View style={[
            styles.categoryIcon,
            { backgroundColor: categoryDisplay.color + "20" }
          ]}>
            <Feather
              name={categoryDisplay.icon as any}
              size={18}
              color={categoryDisplay.color}
            />
          </View>
          <View style={styles.budgetInfo}>
            <ThemedText type="body">
              {categoryDisplay.name}
            </ThemedText>
            <View style={styles.budgetTypeTag}>
              <Feather
                name={BUDGET_TYPE_INFO[budget.budgetType].icon as any}
                size={10}
                color={theme.textSecondary}
              />
              <ThemedText type="tiny" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                {BUDGET_TYPE_INFO[budget.budgetType].label}
              </ThemedText>
            </View>
          </View>
          <View style={styles.budgetAmount}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>
              ${effectiveBudget.toFixed(0)}
            </ThemedText>
            {budget.rolloverBalance > 0 ? (
              <ThemedText type="tiny" style={{ color: theme.success }}>
                +${budget.rolloverBalance.toFixed(0)} rollover
              </ThemedText>
            ) : null}
          </View>
        </View>
        
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: statusColor,
                  width: `${Math.min(percentage, 100)}%`,
                },
              ]}
            />
            {budget.alertThreshold < 100 ? (
              <View
                style={[
                  styles.thresholdMarker,
                  { left: `${budget.alertThreshold}%`, backgroundColor: theme.warning },
                ]}
              />
            ) : null}
          </View>
          <View style={styles.progressLabels}>
            <ThemedText type="tiny" style={{ color: statusColor }}>
              ${spent.toFixed(0)} spent
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              ${Math.max(0, effectiveBudget - spent).toFixed(0)} left
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <Card style={styles.summaryCard}>
          <ThemedText type="heading" style={{ marginBottom: Spacing.md }}>
            Monthly Budget Overview
          </ThemedText>
          <View style={styles.summaryStats}>
            <View style={styles.summaryStat}>
              <ThemedText type="h2" style={{ color: theme.primary }}>
                ${budgetStats.total.toFixed(0)}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Total Budget
              </ThemedText>
            </View>
            <View style={styles.summaryStat}>
              <ThemedText type="h2" style={{ color: theme.text }}>
                ${budgetStats.used.toFixed(0)}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Spent
              </ThemedText>
            </View>
            <View style={styles.summaryStat}>
              <ThemedText 
                type="h2" 
                style={{ color: budgetStats.remaining >= 0 ? theme.success : theme.error }}
              >
                ${budgetStats.remaining.toFixed(0)}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Remaining
              </ThemedText>
            </View>
          </View>
          
          {budgetStats.potentialSavings > 0 ? (
            <View style={[styles.savingsHint, { backgroundColor: theme.success + "15" }]}>
              <Feather name="trending-up" size={16} color={theme.success} />
              <ThemedText type="small" style={{ color: theme.success, marginLeft: Spacing.sm, flex: 1 }}>
                You could save ${budgetStats.potentialSavings.toFixed(0)} this month if you stay on budget!
              </ThemedText>
            </View>
          ) : null}
        </Card>

        <View style={styles.budgetTypeExplainer}>
          <ThemedText type="heading" style={{ marginBottom: Spacing.md }}>
            Budget Types
          </ThemedText>
          {(Object.keys(BUDGET_TYPE_INFO) as BudgetType[]).map((type) => (
            <View key={type} style={styles.typeRow}>
              <View style={[styles.typeIcon, { backgroundColor: theme.primary + "15" }]}>
                <Feather name={BUDGET_TYPE_INFO[type].icon as any} size={16} color={theme.primary} />
              </View>
              <View style={styles.typeInfo}>
                <ThemedText type="small" style={{ fontWeight: "600" }}>
                  {BUDGET_TYPE_INFO[type].label}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  {BUDGET_TYPE_INFO[type].description}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.categoryHeader}>
          <ThemedText type="heading">
            Category Budgets
          </ThemedText>
          <Pressable
            style={[styles.addCategoryButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.navigate("AddCategory" as never)}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <ThemedText type="small" style={{ color: "#FFFFFF", marginLeft: 4 }}>Add</ThemedText>
          </Pressable>
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
          Tap any category to edit its budget
        </ThemedText>

        {data?.categoryBudgets.map(renderBudgetCard)}
      </ScrollView>

      <Modal
        visible={editingBudget !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingBudget(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEditingBudget(null)}>
              <ThemedText type="body" style={{ color: theme.primary }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="heading">
              Edit {editingBudget ? getCategoryDisplay(editingBudget.category).name : ""}
            </ThemedText>
            <Pressable onPress={handleSaveBudget}>
              <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>Save</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
              Monthly Limit
            </ThemedText>
            <View style={[styles.amountInput, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <ThemedText type="h2" style={{ color: theme.textSecondary }}>$</ThemedText>
              <TextInput
                style={[styles.amountInputField, { color: theme.text }]}
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                autoFocus
              />
            </View>

            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
              Budget Type
            </ThemedText>
            <View style={styles.typeSelector}>
              {(Object.keys(BUDGET_TYPE_INFO) as BudgetType[]).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setEditType(type)}
                  style={[
                    styles.typeSelectorItem,
                    {
                      backgroundColor: editType === type ? theme.primary : theme.backgroundDefault,
                      borderColor: editType === type ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Feather
                    name={BUDGET_TYPE_INFO[type].icon as any}
                    size={18}
                    color={editType === type ? "#FFFFFF" : theme.text}
                  />
                  <ThemedText
                    type="small"
                    style={{
                      color: editType === type ? "#FFFFFF" : theme.text,
                      marginTop: Spacing.xs,
                    }}
                  >
                    {BUDGET_TYPE_INFO[type].label}
                  </ThemedText>
                  <ThemedText
                    type="tiny"
                    style={{
                      color: editType === type ? "rgba(255,255,255,0.8)" : theme.textSecondary,
                      textAlign: "center",
                    }}
                  >
                    {BUDGET_TYPE_INFO[type].description}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
              Alert Threshold
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              Get notified when spending reaches this percentage
            </ThemedText>
            <View style={styles.thresholdSelector}>
              {[50, 70, 80, 90].map((threshold) => (
                <Pressable
                  key={threshold}
                  onPress={() => setEditThreshold(threshold.toString())}
                  style={[
                    styles.thresholdItem,
                    {
                      backgroundColor: editThreshold === threshold.toString() ? theme.warning : theme.backgroundDefault,
                      borderColor: editThreshold === threshold.toString() ? theme.warning : theme.border,
                    },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={{ color: editThreshold === threshold.toString() ? "#FFFFFF" : theme.text }}
                  >
                    {threshold}%
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {editType === "rollover" && editingBudget?.rolloverBalance ? (
              <View style={[styles.rolloverInfo, { backgroundColor: theme.success + "15" }]}>
                <Feather name="info" size={16} color={theme.success} />
                <ThemedText type="small" style={{ color: theme.success, marginLeft: Spacing.sm, flex: 1 }}>
                  Current rollover balance: ${editingBudget.rolloverBalance.toFixed(0)}
                </ThemedText>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryStat: {
    alignItems: "center",
  },
  savingsHint: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  budgetTypeExplainer: {
    marginBottom: Spacing.lg,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  typeInfo: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  budgetCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  budgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  budgetTypeTag: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  budgetAmount: {
    alignItems: "flex-end",
  },
  progressContainer: {
    marginTop: Spacing.xs,
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
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalContent: {
    padding: Spacing.lg,
  },
  amountInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  amountInputField: {
    flex: 1,
    fontSize: 32,
    fontWeight: "700",
    marginLeft: Spacing.xs,
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeSelectorItem: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  thresholdSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  thresholdItem: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  rolloverInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  addCategoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
});
