import React from "react";
import { View, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { BudgetCard } from "@/components/BudgetCard";
import { QuickActions } from "@/components/QuickActions";
import { ExpenseItem } from "@/components/ExpenseItem";
import { GoalCard } from "@/components/GoalCard";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/storage";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);
  const recentExpenses = data?.expenses.slice(0, 5) || [];
  const activeGoals = data?.goals.slice(0, 2) || [];

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleAddGoal = () => {
    navigation.navigate("AddGoal");
  };

  const handleSetBudget = () => {
    navigation.navigate("SetBudget");
  };

  const renderContent = () => (
    <View style={styles.content}>
      <BudgetCard
        spent={totalSpent}
        limit={data?.budget?.monthlyLimit || 2000}
        month={new Date().toLocaleString("default", { month: "long" })}
        onPress={handleSetBudget}
      />

      <QuickActions
        onAddExpense={handleAddExpense}
        onScanReceipt={handleScanReceipt}
        onAddGoal={handleAddGoal}
      />

      {recentExpenses.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="heading">Recent Expenses</ThemedText>
            <ThemedText
              type="link"
              onPress={() => navigation.navigate("ExpensesTab")}
            >
              See All
            </ThemedText>
          </View>
          {recentExpenses.map((expense) => (
            <ExpenseItem
              key={expense.id}
              expense={expense}
              partnerName={
                data?.partners[expense.paidBy]?.name || "Partner"
              }
              onPress={() =>
                navigation.navigate("ExpenseDetail", { expenseId: expense.id })
              }
            />
          ))}
        </View>
      ) : null}

      {activeGoals.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="heading">Active Goals</ThemedText>
            <ThemedText
              type="link"
              onPress={() => navigation.navigate("GoalsTab")}
            >
              See All
            </ThemedText>
          </View>
          <View style={styles.goalsGrid}>
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onPress={() =>
                  navigation.navigate("GoalDetail", { goalId: goal.id })
                }
              />
            ))}
          </View>
        </View>
      ) : (
        <Card style={styles.emptyGoalsCard} onPress={handleAddGoal}>
          <View style={styles.emptyGoalsContent}>
            <View style={[styles.emptyGoalsIcon, { backgroundColor: theme.success + "20" }]}>
              <Feather name="target" size={24} color={theme.success} />
            </View>
            <View style={styles.emptyGoalsText}>
              <ThemedText type="heading">Start a shared goal</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Save together for your dreams
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </Card>
      )}
    </View>
  );

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={[{ key: "content" }]}
      renderItem={renderContent}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refreshData} />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
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
  goalsGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  emptyGoalsCard: {
    marginBottom: Spacing.lg,
  },
  emptyGoalsContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  emptyGoalsIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyGoalsText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
});
