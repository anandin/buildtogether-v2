import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/storage";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { ExpenseCategory } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

const screenWidth = Dimensions.get("window").width;

export default function ChartScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { data } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "year">("month");

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<ExpenseCategory, number> = {} as Record<ExpenseCategory, number>;
    
    currentMonthExpenses.forEach((expense) => {
      breakdown[expense.category] = (breakdown[expense.category] || 0) + expense.amount;
    });

    return Object.entries(breakdown)
      .map(([category, amount]) => ({
        category: category as ExpenseCategory,
        amount,
        percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentMonthExpenses, totalSpent]);

  const partnerBreakdown = useMemo(() => {
    let partner1Total = 0;
    let partner2Total = 0;

    currentMonthExpenses.forEach((expense) => {
      if (expense.paidBy === "partner1") {
        partner1Total += expense.amount;
      } else if (expense.paidBy === "partner2") {
        partner2Total += expense.amount;
      }
    });

    return { partner1Total, partner2Total };
  }, [currentMonthExpenses]);

  const chartData = useMemo(() => {
    const dailyTotals: number[] = Array(7).fill(0);
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      currentMonthExpenses.forEach((expense) => {
        const expenseDate = new Date(expense.date);
        if (
          expenseDate.getDate() === date.getDate() &&
          expenseDate.getMonth() === date.getMonth()
        ) {
          dailyTotals[6 - i] += expense.amount;
        }
      });
    }
    
    return dailyTotals;
  }, [currentMonthExpenses]);

  const maxChartValue = Math.max(...chartData, 1);
  const chartHeight = 150;
  const chartWidth = screenWidth - Spacing.lg * 4;
  const barWidth = (chartWidth - 60) / 7;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Card style={styles.summaryCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Total Spending This Month
        </ThemedText>
        <ThemedText type="h1" style={{ color: theme.primary }}>
          ${totalSpent.toLocaleString()}
        </ThemedText>
        <View style={styles.periodTabs}>
          {(["week", "month", "year"] as const).map((period) => (
            <Pressable
              key={period}
              onPress={() => setSelectedPeriod(period)}
              style={[
                styles.periodTab,
                selectedPeriod === period && { backgroundColor: theme.primary + "20" },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: selectedPeriod === period ? theme.primary : theme.textSecondary }}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={styles.chartCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          Last 7 Days
        </ThemedText>
        <Svg width={chartWidth} height={chartHeight + 40}>
          {chartData.map((value, index) => {
            const barHeight = (value / maxChartValue) * chartHeight;
            const x = 30 + index * barWidth + barWidth * 0.2;
            const y = chartHeight - barHeight;
            
            const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const today = new Date().getDay();
            const labelIndex = (today - 6 + index + 7) % 7;
            
            return (
              <React.Fragment key={index}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth * 0.6}
                  height={barHeight}
                  rx={4}
                  fill={theme.primary}
                />
                <SvgText
                  x={x + barWidth * 0.3}
                  y={chartHeight + 20}
                  fontSize={10}
                  fill={theme.textSecondary}
                  textAnchor="middle"
                >
                  {dayLabels[labelIndex]}
                </SvgText>
              </React.Fragment>
            );
          })}
          <Line
            x1={30}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke={theme.border}
            strokeWidth={1}
          />
        </Svg>
      </Card>

      <Card style={styles.breakdownCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          By Category
        </ThemedText>
        {categoryBreakdown.map((item) => (
          <View key={item.category} style={styles.categoryRow}>
            <View style={styles.categoryInfo}>
              <View
                style={[
                  styles.categoryIcon,
                  { backgroundColor: CATEGORY_COLORS[item.category] + "20" },
                ]}
              >
                <Feather
                  name={CATEGORY_ICONS[item.category] as any}
                  size={16}
                  color={CATEGORY_COLORS[item.category]}
                />
              </View>
              <ThemedText type="body">{CATEGORY_LABELS[item.category]}</ThemedText>
            </View>
            <View style={styles.categoryAmount}>
              <ThemedText type="body">${item.amount.toFixed(2)}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.percentage.toFixed(0)}%
              </ThemedText>
            </View>
          </View>
        ))}
      </Card>

      <Card style={styles.partnerCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          By Partner
        </ThemedText>
        <View style={styles.partnerRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner1.color || theme.primary }]}>
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner1.name?.charAt(0) || "Y"}
              </ThemedText>
            </View>
            <ThemedText type="body">{data?.partners.partner1.name || "You"}</ThemedText>
          </View>
          <ThemedText type="heading">${partnerBreakdown.partner1Total.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.partnerRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner2.color || theme.accent }]}>
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner2.name?.charAt(0) || "P"}
              </ThemedText>
            </View>
            <ThemedText type="body">{data?.partners.partner2.name || "Partner"}</ThemedText>
          </View>
          <ThemedText type="heading">${partnerBreakdown.partner2Total.toFixed(2)}</ThemedText>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  periodTabs: {
    flexDirection: "row",
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  periodTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  chartCard: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  breakdownCard: {
    marginBottom: Spacing.lg,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  categoryInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryAmount: {
    alignItems: "flex-end",
  },
  partnerCard: {
    marginBottom: Spacing.lg,
  },
  partnerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  partnerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
