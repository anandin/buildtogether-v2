import React, { useMemo } from "react";
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";

import { BudgetCard } from "@/components/BudgetCard";
import { QuickActions } from "@/components/QuickActions";
import { DreamGuardian } from "@/components/DreamGuardian";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { PremiumGate } from "@/components/PremiumGate";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const { isPremium } = useSubscription();

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleAddDream = () => {
    navigation.navigate("AddDream");
  };

  const handleAddToDream = () => {
    if (data?.goals && data.goals.length > 0) {
      navigation.navigate("DreamDetail", { dreamId: data.goals[0].id });
    } else {
      navigation.navigate("AddDream");
    }
  };

  const recentExpenses = useMemo(() => {
    return currentMonthExpenses
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [currentMonthExpenses]);

  const renderContent = () => (
    <View style={styles.content}>
      {isPremium ? (
        <DreamGuardian 
          onAddToGoal={handleAddToDream} 
          coupleId={user?.coupleId ?? undefined}
        />
      ) : (
        <PremiumGate 
          feature="Dream Guardian AI"
          description="Your self-learning AI companion that observes your habits and delivers hyper-personalized nudges to help you save"
        >
          <DreamGuardian 
            onAddToGoal={handleAddToDream} 
            coupleId={user?.coupleId ?? undefined}
          />
        </PremiumGate>
      )}

      <QuickActions
        onAddExpense={handleAddExpense}
        onScanReceipt={handleScanReceipt}
        onAddGoal={handleAddDream}
      />

      <BudgetCard
        spent={totalSpent}
        limit={totalBudget}
        month={new Date().toLocaleString("default", { month: "long" })}
        compact
      />

      <Card style={styles.recentCard}>
        <View style={styles.recentHeader}>
          <ThemedText type="heading">Recent Activity</ThemedText>
          <Pressable onPress={() => navigation.navigate("ExpensesTab")}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              See all
            </ThemedText>
          </Pressable>
        </View>
        
        {recentExpenses.length > 0 ? (
          recentExpenses.map((expense) => (
            <Pressable
              key={expense.id}
              style={styles.recentItem}
              onPress={() => navigation.navigate("ExpenseDetail", { expenseId: expense.id })}
            >
              <View style={[
                styles.categoryIcon,
                { backgroundColor: (CATEGORY_COLORS[expense.category] || theme.primary) + "15" }
              ]}>
                <Feather
                  name={(CATEGORY_ICONS[expense.category] || "circle") as any}
                  size={16}
                  color={CATEGORY_COLORS[expense.category] || theme.primary}
                />
              </View>
              <View style={styles.recentInfo}>
                <ThemedText type="body" numberOfLines={1}>
                  {expense.description}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  {CATEGORY_LABELS[expense.category] || expense.category} · {format(new Date(expense.date), "MMM d")}
                </ThemedText>
              </View>
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                ${expense.amount.toFixed(2)}
              </ThemedText>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyRecent}>
            <Feather name="inbox" size={32} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              No expenses yet this month
            </ThemedText>
          </View>
        )}
      </Card>
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
  recentCard: {
    marginTop: Spacing.lg,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  recentInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 2,
  },
  emptyRecent: {
    alignItems: "center",
    padding: Spacing.xl,
  },
});
