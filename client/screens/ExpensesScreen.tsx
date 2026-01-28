import React, { useState, useMemo } from "react";
import { View, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format, isToday, isYesterday, isThisWeek, startOfWeek, endOfWeek } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { CategoryBudgetCard } from "@/components/CategoryBudgetCard";
import { MonthlySettlementSummary } from "@/components/MonthlySettlementSummary";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getTotalSpent, calculateOwedAmounts } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense, ExpenseCategory } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS, DEFAULT_CATEGORIES } from "@/types";

type GroupedExpenses = {
  title: string;
  data: Expense[];
};

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);
  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const owedAmounts = useMemo(() => {
    return data ? calculateOwedAmounts(data.expenses, data.partners) : { partner1Owes: 0, partner2Owes: 0 };
  }, [data]);

  const netOwed = owedAmounts.partner1Owes - owedAmounts.partner2Owes;
  const owesPerson = netOwed > 0 ? data?.partners.partner1.name : data?.partners.partner2.name;
  const owedPerson = netOwed > 0 ? data?.partners.partner2.name : data?.partners.partner1.name;
  const absOwed = Math.abs(netOwed);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    currentMonthExpenses.forEach((expense) => {
      counts[expense.category] = (counts[expense.category] || 0) + 1;
    });
    return counts;
  }, [currentMonthExpenses]);

  const activeCategories = useMemo(() => {
    return DEFAULT_CATEGORIES.filter(cat => categoryCounts[cat] > 0);
  }, [categoryCounts]);

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return [];

    let filtered = currentMonthExpenses;

    if (selectedCategory) {
      filtered = filtered.filter((expense) => expense.category === selectedCategory);
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [currentMonthExpenses, selectedCategory]);

  const groupedExpenses = useMemo(() => {
    const groups: GroupedExpenses[] = [];
    const today: Expense[] = [];
    const yesterday: Expense[] = [];
    const thisWeek: Expense[] = [];
    const earlier: Expense[] = [];

    filteredExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      if (isToday(date)) {
        today.push(expense);
      } else if (isYesterday(date)) {
        yesterday.push(expense);
      } else if (isThisWeek(date, { weekStartsOn: 0 })) {
        thisWeek.push(expense);
      } else {
        earlier.push(expense);
      }
    });

    if (today.length > 0) groups.push({ title: "Today", data: today });
    if (yesterday.length > 0) groups.push({ title: "Yesterday", data: yesterday });
    if (thisWeek.length > 0) groups.push({ title: "This Week", data: thisWeek });
    if (earlier.length > 0) groups.push({ title: "Earlier This Month", data: earlier });

    return groups;
  }, [filteredExpenses]);

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleSettleUp = () => {
    navigation.navigate("SettleUp");
  };

  const getPayerInfo = (expense: Expense) => {
    if (expense.paidBy === "joint") {
      return { name: "Joint", color: theme.accent };
    } else if (expense.paidBy === "partner1") {
      return { 
        name: data?.partners.partner1.name || "Partner 1", 
        color: data?.partners.partner1.color || theme.primary 
      };
    } else {
      return { 
        name: data?.partners.partner2.name || "Partner 2", 
        color: data?.partners.partner2.color || theme.accent 
      };
    }
  };

  const renderExpenseItem = (expense: Expense) => {
    const categoryIcon = CATEGORY_ICONS[expense.category] as any;
    const categoryColor = CATEGORY_COLORS[expense.category];
    const payer = getPayerInfo(expense);

    return (
      <Pressable
        key={expense.id}
        style={[styles.expenseRow, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => navigation.navigate("ExpenseDetail", { expenseId: expense.id })}
      >
        <View style={[styles.categoryBadge, { backgroundColor: categoryColor + "20" }]}>
          <Feather name={categoryIcon || "circle"} size={16} color={categoryColor} />
        </View>
        <View style={styles.expenseMain}>
          <ThemedText type="body" numberOfLines={1}>
            {expense.merchant || expense.note || expense.description}
          </ThemedText>
          <View style={styles.expenseMeta}>
            <View style={[styles.payerBadge, { backgroundColor: payer.color + "20" }]}>
              <ThemedText type="tiny" style={{ color: payer.color }}>
                {payer.name}
              </ThemedText>
            </View>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              {CATEGORY_LABELS[expense.category] || expense.category}
            </ThemedText>
          </View>
        </View>
        <View style={styles.expenseAmount}>
          <ThemedText type="heading">${expense.amount.toFixed(2)}</ThemedText>
          <View style={[
            styles.settledBadge, 
            { backgroundColor: expense.isSettled ? theme.success + "20" : theme.warning + "20" }
          ]}>
            <ThemedText type="tiny" style={{ color: expense.isSettled ? theme.success : theme.warning }}>
              {expense.isSettled ? "Settled" : "Pending"}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderGroup = ({ item }: { item: GroupedExpenses }) => (
    <View style={styles.groupSection}>
      <ThemedText type="small" style={[styles.groupTitle, { color: theme.textSecondary }]}>
        {item.title}
      </ThemedText>
      {item.data.map(renderExpenseItem)}
    </View>
  );

  const renderEmpty = () => (
    <EmptyState
      icon="credit-card"
      title="No expenses yet"
      description="Start tracking your shared expenses together"
      actionLabel="Add First Expense"
      onAction={handleAddExpense}
    />
  );

  const renderHeader = () => (
    <>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              This Month
            </ThemedText>
            <ThemedText type="h2">${totalSpent.toFixed(0)}</ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
          <View style={styles.summaryItem}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Budget Left
            </ThemedText>
            <ThemedText 
              type="h2" 
              style={{ color: totalBudget - totalSpent >= 0 ? theme.success : theme.error }}
            >
              ${(totalBudget - totalSpent).toFixed(0)}
            </ThemedText>
          </View>
        </View>
      </Card>

      {absOwed > 0 ? (
        <Card style={styles.settlementCard} onPress={handleSettleUp}>
          <View style={styles.settlementContent}>
            <View style={[styles.settlementIcon, { backgroundColor: theme.warning + "20" }]}>
              <Feather name="repeat" size={20} color={theme.warning} />
            </View>
            <View style={styles.settlementText}>
              <ThemedText type="heading">Settlement Due</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {owesPerson} owes {owedPerson} ${absOwed.toFixed(2)}
              </ThemedText>
            </View>
            <Pressable 
              style={[styles.settleButton, { backgroundColor: theme.primary }]}
              onPress={handleSettleUp}
            >
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>Settle</ThemedText>
            </Pressable>
          </View>
        </Card>
      ) : null}

      <MonthlySettlementSummary onSettleUp={handleSettleUp} />

      <CategoryBudgetCard />

      {activeCategories.length > 0 ? (
        <View style={styles.filterSection}>
          <ThemedText type="small" style={[styles.filterLabel, { color: theme.textSecondary }]}>
            Filter by category
          </ThemedText>
          <View style={styles.categoryChips}>
            <Pressable
              style={[
                styles.categoryChip,
                { 
                  backgroundColor: selectedCategory === null ? theme.primary : theme.backgroundDefault,
                  borderColor: theme.border,
                }
              ]}
              onPress={() => setSelectedCategory(null)}
            >
              <ThemedText 
                type="tiny" 
                style={{ color: selectedCategory === null ? "#FFFFFF" : theme.text }}
              >
                All
              </ThemedText>
            </Pressable>
            {activeCategories.slice(0, 5).map((cat) => (
              <Pressable
                key={cat}
                style={[
                  styles.categoryChip,
                  { 
                    backgroundColor: selectedCategory === cat 
                      ? CATEGORY_COLORS[cat] 
                      : theme.backgroundDefault,
                    borderColor: CATEGORY_COLORS[cat],
                  }
                ]}
                onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                <Feather 
                  name={CATEGORY_ICONS[cat] as any} 
                  size={12} 
                  color={selectedCategory === cat ? "#FFFFFF" : CATEGORY_COLORS[cat]} 
                />
                <ThemedText 
                  type="tiny" 
                  style={{ color: selectedCategory === cat ? "#FFFFFF" : theme.text }}
                >
                  {CATEGORY_LABELS[cat]}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.expenseHeader}>
        <ThemedText type="heading">
          {selectedCategory ? CATEGORY_LABELS[selectedCategory] : "All Expenses"}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""}
        </ThemedText>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: tabBarHeight + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={groupedExpenses}
        keyExtractor={(item) => item.title}
        renderItem={renderGroup}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={filteredExpenses.length === 0 ? renderEmpty : null}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshData} />
        }
      />
      <FloatingActionButton
        onAddExpense={handleAddExpense}
        onScanReceipt={handleScanReceipt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  summaryCard: {
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
  },
  settlementCard: {
    marginBottom: Spacing.md,
  },
  settlementContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  settlementIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  settlementText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  settleButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  filterSection: {
    marginBottom: Spacing.lg,
  },
  filterLabel: {
    marginBottom: Spacing.sm,
  },
  categoryChips: {
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
  expenseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  groupSection: {
    marginBottom: Spacing.lg,
  },
  groupTitle: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  expenseMain: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  expenseMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  payerBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  expenseAmount: {
    alignItems: "flex-end",
    gap: 4,
  },
  settledBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
});
