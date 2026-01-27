import React, { useMemo } from "react";
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
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
import { AICoach } from "@/components/AICoach";
import { CategoryBudgetCard } from "@/components/CategoryBudgetCard";
import { HarmonySpark } from "@/components/HarmonySpark";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getTotalSpent, calculateOwedAmounts, getUnsettledExpenses } from "@/lib/storage";
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
  const recentExpenses = data?.expenses.slice(0, 3) || [];
  const activeGoals = data?.goals.slice(0, 2) || [];

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const owedAmounts = useMemo(() => {
    return data ? calculateOwedAmounts(data.expenses, data.partners) : { partner1Owes: 0, partner2Owes: 0 };
  }, [data]);

  const unsettledCount = useMemo(() => {
    return data ? getUnsettledExpenses(data.expenses).length : 0;
  }, [data]);

  const netOwed = owedAmounts.partner1Owes - owedAmounts.partner2Owes;
  const absOwed = Math.abs(netOwed);

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleAddGoal = () => {
    navigation.navigate("AddGoal");
  };

  const handleSettleUp = () => {
    navigation.navigate("SettleUp");
  };

  const handleHarmonySparkPress = () => {
    navigation.navigate("GoalsTab");
  };

  const renderContent = () => (
    <View style={styles.content}>
      <HarmonySpark onPress={handleHarmonySparkPress} />

      <BudgetCard
        spent={totalSpent}
        limit={totalBudget}
        month={new Date().toLocaleString("default", { month: "long" })}
      />

      {unsettledCount > 0 ? (
        <Card style={styles.settleCard} onPress={handleSettleUp}>
          <View style={styles.settleContent}>
            <View style={[styles.settleIcon, { backgroundColor: theme.warning + "20" }]}>
              <Feather name="repeat" size={20} color={theme.warning} />
            </View>
            <View style={styles.settleText}>
              <ThemedText type="heading">Settle Up</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {unsettledCount} unsettled expense{unsettledCount !== 1 ? "s" : ""} • ${absOwed.toFixed(2)} owed
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </Card>
      ) : null}

      <QuickActions
        onAddExpense={handleAddExpense}
        onScanReceipt={handleScanReceipt}
        onAddGoal={handleAddGoal}
      />

      <View style={styles.section}>
        <AICoach />
      </View>

      <View style={styles.section}>
        <CategoryBudgetCard />
      </View>

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
                data?.partners[expense.paidBy === "joint" ? "partner1" : expense.paidBy]?.name || "Partner"
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
  settleCard: {
    marginBottom: Spacing.lg,
  },
  settleContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  settleIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  settleText: {
    flex: 1,
    marginLeft: Spacing.md,
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
