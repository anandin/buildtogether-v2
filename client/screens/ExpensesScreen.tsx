import React, { useState, useMemo } from "react";
import { View, FlatList, StyleSheet, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { ExpenseItem } from "@/components/ExpenseItem";
import { CalendarView } from "@/components/CalendarView";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");

  const filteredExpenses = useMemo(() => {
    if (!data?.expenses) return [];

    let filtered = data.expenses.filter((expense) => {
      const expenseDate = new Date(expense.date);
      return (
        expenseDate.getFullYear() === currentMonth.getFullYear() &&
        expenseDate.getMonth() === currentMonth.getMonth()
      );
    });

    if (selectedDate) {
      filtered = filtered.filter((expense) => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getDate() === selectedDate.getDate();
      });
    }

    if (sortBy === "amount") {
      filtered.sort((a, b) => b.amount - a.amount);
    }

    return filtered;
  }, [data?.expenses, currentMonth, selectedDate, sortBy]);

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleSettleUp = () => {
    navigation.navigate("SettleUp");
  };

  const renderItem = ({ item }: { item: Expense }) => {
    const categoryIcon = CATEGORY_ICONS[item.category] as any;
    const categoryColor = CATEGORY_COLORS[item.category];

    return (
      <Pressable
        style={[styles.expenseRow, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => navigation.navigate("ExpenseDetail", { expenseId: item.id })}
      >
        <View style={styles.expenseMain}>
          <ThemedText type="body" numberOfLines={1} style={styles.expenseDescription}>
            {item.note || item.description}
          </ThemedText>
          <View style={styles.expenseMeta}>
            <View style={[styles.splitBadge, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText type="tiny" style={{ color: theme.primary }}>
                {item.splitMethod === "even" ? "Even" : item.splitMethod}
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {format(new Date(item.date), "EEE, MM-dd")}
            </ThemedText>
            <View style={[styles.categoryBadge, { backgroundColor: categoryColor + "20" }]}>
              <Feather name={categoryIcon} size={12} color={categoryColor} />
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {CATEGORY_LABELS[item.category]}
            </ThemedText>
          </View>
        </View>
        <View style={styles.expenseAmount}>
          <Feather name="menu" size={14} color={theme.textSecondary} />
          <ThemedText type="heading">${item.amount.toFixed(2)}</ThemedText>
          <View style={[styles.settledBadge, { backgroundColor: item.isSettled ? theme.success + "20" : theme.accent + "20" }]}>
            <ThemedText type="tiny" style={{ color: item.isSettled ? theme.success : theme.accent }}>
              {item.isSettled ? "Settled" : "Pending"}
            </ThemedText>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <EmptyState
      icon="credit-card"
      title="No expenses yet"
      description="Start tracking your shared expenses together"
      actionLabel="Add First Expense"
      onAction={handleAddExpense}
    />
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
        data={filteredExpenses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <CalendarView
              expenses={data?.expenses || []}
              currentDate={currentMonth}
              onMonthChange={setCurrentMonth}
              onDayPress={(date) => {
                setSelectedDate(
                  selectedDate?.getDate() === date.getDate() ? undefined : date
                );
              }}
              selectedDate={selectedDate}
            />
            <View style={styles.sortRow}>
              <Pressable onPress={() => setSortBy(sortBy === "date" ? "amount" : "date")}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  Sorted by {sortBy === "date" ? "edit time" : "amount"} ({filteredExpenses.length})
                </ThemedText>
              </Pressable>
              <View style={styles.sortActions}>
                <Pressable hitSlop={8}>
                  <Feather name="search" size={18} color={theme.textSecondary} />
                </Pressable>
                <Pressable hitSlop={8}>
                  <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setSortBy(sortBy === "date" ? "amount" : "date")}>
                  <Feather name="sliders" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>
          </>
        }
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
  sortRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sortActions: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  expenseMain: {
    flex: 1,
  },
  expenseDescription: {
    marginBottom: 4,
  },
  expenseMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  splitBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  categoryBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
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
