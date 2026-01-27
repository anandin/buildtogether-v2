import React, { useState, useMemo } from "react";
import { View, FlatList, StyleSheet, TextInput, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format, isToday, isYesterday, isThisWeek, isThisMonth } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { ExpenseItem } from "@/components/ExpenseItem";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";

interface GroupedExpenses {
  title: string;
  data: Expense[];
}

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const [searchQuery, setSearchQuery] = useState("");

  const groupedExpenses = useMemo(() => {
    if (!data?.expenses) return [];

    const filtered = data.expenses.filter((expense) =>
      expense.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: Record<string, Expense[]> = {};

    filtered.forEach((expense) => {
      const date = new Date(expense.date);
      let groupKey: string;

      if (isToday(date)) {
        groupKey = "Today";
      } else if (isYesterday(date)) {
        groupKey = "Yesterday";
      } else if (isThisWeek(date)) {
        groupKey = "This Week";
      } else if (isThisMonth(date)) {
        groupKey = "This Month";
      } else {
        groupKey = format(date, "MMMM yyyy");
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(expense);
    });

    return Object.entries(groups).map(([title, data]) => ({
      title,
      data,
    }));
  }, [data?.expenses, searchQuery]);

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const renderSectionHeader = ({ section }: { section: GroupedExpenses }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
      <ThemedText type="small" style={{ color: theme.textSecondary }}>
        {section.title}
      </ThemedText>
    </View>
  );

  const renderItem = ({ item }: { item: Expense }) => (
    <ExpenseItem
      expense={item}
      partnerName={data?.partners[item.paidBy]?.name || "Partner"}
      onPress={() => navigation.navigate("ExpenseDetail", { expenseId: item.id })}
    />
  );

  const renderEmpty = () => (
    <EmptyState
      image={require("../../assets/images/empty-expenses.png")}
      title="No expenses yet"
      description="Start tracking your shared expenses together"
      actionLabel="Add First Expense"
      onAction={handleAddExpense}
    />
  );

  const allExpenses = groupedExpenses.flatMap((group) =>
    [{ type: "header" as const, title: group.title }, ...group.data.map((item) => ({ type: "item" as const, item }))]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={allExpenses}
        keyExtractor={(item, index) =>
          item.type === "header" ? `header-${item.title}` : `item-${item.item.id}`
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {item.title}
                </ThemedText>
              </View>
            );
          }
          return (
            <ExpenseItem
              expense={item.item}
              partnerName={data?.partners[item.item.paidBy]?.name || "Partner"}
              onPress={() =>
                navigation.navigate("ExpenseDetail", { expenseId: item.item.id })
              }
            />
          );
        }}
        ListHeaderComponent={
          <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search expenses..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        }
        ListEmptyComponent={searchQuery ? null : renderEmpty}
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: 16,
  },
  sectionHeader: {
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
