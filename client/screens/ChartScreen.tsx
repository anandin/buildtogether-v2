import React, { useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Svg, { Rect, Text as SvgText, Line } from "react-native-svg";
import { format, subDays } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { SteadyProgress } from "@/components/SteadyProgress";
import { SpendingInsights } from "@/components/SpendingInsights";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getTotalSpent, getMerchantSpending } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

const screenWidth = Dimensions.get("window").width;

export default function ChartScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<"week" | "month" | "year">("month");

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const lastMonthTotal = useMemo(() => {
    if (!data) return 0;
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return data.expenses
      .filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }, [data]);

  const spendingChange = lastMonthTotal > 0 
    ? ((totalSpent - lastMonthTotal) / lastMonthTotal) * 100 
    : 0;

  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    
    currentMonthExpenses.forEach((expense) => {
      breakdown[expense.category] = (breakdown[expense.category] || 0) + expense.amount;
    });

    return Object.entries(breakdown)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentMonthExpenses, totalSpent]);

  const merchantInsights = useMemo(() => {
    const merchants = getMerchantSpending(data?.expenses || []);
    return Object.entries(merchants)
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [data?.expenses]);

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

  const getDayLabels = () => {
    const labels = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      labels.push(format(date, "EEE"));
    }
    return labels;
  };

  const dayLabels = getDayLabels();
  const maxChartValue = Math.max(...chartData, 1);
  const chartHeight = 150;
  const chartWidth = screenWidth - Spacing.lg * 4;
  const barWidth = (chartWidth - 60) / 7;

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const budgetRemaining = totalBudget - totalSpent;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const currentDay = new Date().getDate();
  const daysRemaining = daysInMonth - currentDay;
  const dailyBudget = daysRemaining > 0 ? budgetRemaining / daysRemaining : 0;

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
      <SteadyProgress />

      <SpendingInsights />

      <Card style={styles.futureCard} onPress={() => navigation.navigate("FutureTimeline")}>
        <View style={styles.futureContent}>
          <View style={[styles.futureIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="sunrise" size={20} color={theme.primary} />
          </View>
          <View style={styles.futureText}>
            <ThemedText type="heading">Future Us</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              See when your dreams become reality
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </View>
      </Card>

      <Card style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {format(new Date(), "MMMM")} Spending
          </ThemedText>
          <View style={[
            styles.changeIndicator,
            { backgroundColor: spendingChange <= 0 ? theme.success + "20" : theme.error + "20" }
          ]}>
            <Feather 
              name={spendingChange <= 0 ? "trending-down" : "trending-up"} 
              size={12} 
              color={spendingChange <= 0 ? theme.success : theme.error} 
            />
            <ThemedText 
              type="tiny" 
              style={{ color: spendingChange <= 0 ? theme.success : theme.error }}
            >
              {Math.abs(spendingChange).toFixed(0)}% vs last month
            </ThemedText>
          </View>
        </View>
        <ThemedText type="h1" style={{ marginVertical: Spacing.sm }}>
          ${totalSpent.toFixed(2)}
        </ThemedText>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Daily Budget
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.success }}>
              ${dailyBudget.toFixed(0)}/day
            </ThemedText>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Remaining
            </ThemedText>
            <ThemedText type="body" style={{ color: budgetRemaining >= 0 ? theme.text : theme.error }}>
              ${budgetRemaining.toFixed(0)}
            </ThemedText>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Days Left
            </ThemedText>
            <ThemedText type="body">
              {daysRemaining}
            </ThemedText>
          </View>
        </View>
      </Card>

      <View style={styles.periodTabs}>
        {(["week", "month", "year"] as const).map((period) => (
          <Pressable
            key={period}
            onPress={() => setSelectedPeriod(period)}
            style={[
              styles.periodTab,
              {
                backgroundColor: selectedPeriod === period ? theme.primary : theme.backgroundDefault,
              },
            ]}
          >
            <ThemedText
              type="small"
              style={{
                color: selectedPeriod === period ? "#FFFFFF" : theme.textSecondary,
                textTransform: "capitalize",
              }}
            >
              {period}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <Card style={styles.chartCard}>
        <ThemedText type="heading" style={styles.chartTitle}>
          Last 7 Days
        </ThemedText>
        <View style={styles.chartContainer}>
          <Svg width={chartWidth} height={chartHeight + 40}>
            <Line
              x1="30"
              y1={chartHeight}
              x2={chartWidth}
              y2={chartHeight}
              stroke={theme.border}
              strokeWidth="1"
            />
            
            {chartData.map((value, index) => {
              const barHeight = (value / maxChartValue) * (chartHeight - 20);
              const x = 40 + index * barWidth;
              const y = chartHeight - barHeight;
              
              return (
                <React.Fragment key={index}>
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth - 8}
                    height={barHeight}
                    rx={4}
                    fill={value > 0 ? theme.primary : theme.border}
                  />
                  <SvgText
                    x={x + (barWidth - 8) / 2}
                    y={chartHeight + 18}
                    fontSize="10"
                    fill={theme.textSecondary}
                    textAnchor="middle"
                  >
                    {dayLabels[index]}
                  </SvgText>
                  {value > 0 ? (
                    <SvgText
                      x={x + (barWidth - 8) / 2}
                      y={y - 5}
                      fontSize="9"
                      fill={theme.text}
                      textAnchor="middle"
                    >
                      ${value.toFixed(0)}
                    </SvgText>
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      </Card>

      <Card style={styles.categoryCard}>
        <View style={styles.sectionHeader}>
          <ThemedText type="heading">Where Your Money Goes</ThemedText>
        </View>
        
        {categoryBreakdown.length > 0 ? (
          categoryBreakdown.slice(0, 6).map((item) => (
            <View key={item.category} style={styles.categoryRow}>
              <View style={[
                styles.categoryIconBox,
                { backgroundColor: (CATEGORY_COLORS[item.category] || theme.primary) + "20" }
              ]}>
                <Feather
                  name={(CATEGORY_ICONS[item.category] || "circle") as any}
                  size={16}
                  color={CATEGORY_COLORS[item.category] || theme.primary}
                />
              </View>
              <View style={styles.categoryInfo}>
                <ThemedText type="body">
                  {CATEGORY_LABELS[item.category] || item.category}
                </ThemedText>
                <View style={[styles.categoryBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[
                      styles.categoryBarFill,
                      {
                        backgroundColor: CATEGORY_COLORS[item.category] || theme.primary,
                        width: `${Math.min(item.percentage, 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.categoryAmount}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  ${item.amount.toFixed(0)}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  {item.percentage.toFixed(0)}%
                </ThemedText>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Feather name="pie-chart" size={32} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              No expenses this month yet
            </ThemedText>
          </View>
        )}
      </Card>

      {merchantInsights.length > 0 ? (
        <Card style={styles.merchantCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="heading">Top Merchants</ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              All time
            </ThemedText>
          </View>
          
          {merchantInsights.map((merchant, index) => (
            <View key={merchant.name} style={styles.merchantRow}>
              <View style={[styles.merchantRank, { backgroundColor: theme.primary + "15" }]}>
                <ThemedText type="small" style={{ color: theme.primary }}>
                  {index + 1}
                </ThemedText>
              </View>
              <View style={styles.merchantInfo}>
                <ThemedText type="body">{merchant.name}</ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  {merchant.count} visit{merchant.count !== 1 ? "s" : ""}
                </ThemedText>
              </View>
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                ${merchant.total.toFixed(0)}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.partnerCard}>
        <ThemedText type="heading" style={{ marginBottom: Spacing.md }}>
          Partner Spending
        </ThemedText>
        
        <View style={styles.partnerCompare}>
          <View style={styles.partnerBox}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner1.color }]}>
              <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner1.name?.charAt(0) || "Y"}
              </ThemedText>
            </View>
            <ThemedText type="small">{data?.partners.partner1.name}</ThemedText>
            <ThemedText type="h3" style={{ color: data?.partners.partner1.color }}>
              ${partnerBreakdown.partner1Total.toFixed(0)}
            </ThemedText>
          </View>
          
          <View style={styles.vsContainer}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>VS</ThemedText>
          </View>
          
          <View style={styles.partnerBox}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner2.color }]}>
              <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner2.name?.charAt(0) || "P"}
              </ThemedText>
            </View>
            <ThemedText type="small">{data?.partners.partner2.name}</ThemedText>
            <ThemedText type="h3" style={{ color: data?.partners.partner2.color }}>
              ${partnerBreakdown.partner2Total.toFixed(0)}
            </ThemedText>
          </View>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  futureCard: {
    marginBottom: Spacing.lg,
  },
  futureContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  futureIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  futureText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  heroCard: {
    marginBottom: Spacing.lg,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  changeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  heroStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  heroStat: {
    flex: 1,
    alignItems: "center",
  },
  heroStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  periodTabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  periodTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  chartCard: {
    marginBottom: Spacing.lg,
  },
  chartTitle: {
    marginBottom: Spacing.md,
  },
  chartContainer: {
    alignItems: "center",
  },
  categoryCard: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  categoryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  categoryBar: {
    height: 4,
    borderRadius: 2,
    marginTop: Spacing.xs,
    overflow: "hidden",
  },
  categoryBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  categoryAmount: {
    alignItems: "flex-end",
    marginLeft: Spacing.md,
  },
  emptyState: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  merchantCard: {
    marginBottom: Spacing.lg,
  },
  merchantRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  merchantRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  merchantInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  partnerCard: {
    marginBottom: Spacing.lg,
  },
  partnerCompare: {
    flexDirection: "row",
    alignItems: "center",
  },
  partnerBox: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  partnerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  vsContainer: {
    paddingHorizontal: Spacing.md,
  },
});
