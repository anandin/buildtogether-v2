import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { differenceInDays, startOfDay, subDays, parseISO, isAfter } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses, getEffectiveBudget } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Expense, CategoryBudget } from "@/types";

interface StreakData {
  type: string;
  label: string;
  days: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  description: string;
}

const DISCRETIONARY_CATEGORIES = ["shopping", "entertainment", "restaurants", "personal", "gifts"];

function calculateStreaks(
  expenses: Expense[],
  categoryBudgets: CategoryBudget[]
): StreakData[] {
  const today = startOfDay(new Date());
  const streaks: StreakData[] = [];

  const underBudgetDays = calculateUnderBudgetStreak(expenses, categoryBudgets, today);
  if (underBudgetDays > 0) {
    streaks.push({
      type: "under_budget",
      label: "Under Budget",
      days: underBudgetDays,
      icon: "trending-down",
      color: "#10B981",
      description: `${underBudgetDays} day${underBudgetDays !== 1 ? "s" : ""} of mindful spending`,
    });
  }

  const noImpulseDays = calculateNoImpulseStreak(expenses, today);
  if (noImpulseDays > 0) {
    streaks.push({
      type: "no_impulse",
      label: "Mindful Choices",
      days: noImpulseDays,
      icon: "heart",
      color: "#8B5CF6",
      description: `${noImpulseDays} day${noImpulseDays !== 1 ? "s" : ""} without impulse purchases`,
    });
  }

  const trackingDays = calculateTrackingStreak(expenses, today);
  if (trackingDays > 0) {
    streaks.push({
      type: "daily_tracking",
      label: "Staying Aware",
      days: trackingDays,
      icon: "eye",
      color: "#3B82F6",
      description: `${trackingDays} day${trackingDays !== 1 ? "s" : ""} of expense tracking`,
    });
  }

  return streaks;
}

function calculateUnderBudgetStreak(
  expenses: Expense[],
  categoryBudgets: CategoryBudget[],
  today: Date
): number {
  const monthlyExpenses = getCurrentMonthExpenses(expenses);
  const totalBudget = categoryBudgets.reduce((sum, b) => sum + getEffectiveBudget(b), 0);
  const totalSpent = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  if (totalSpent >= totalBudget) return 0;
  
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const expectedSpend = (totalBudget / daysInMonth) * dayOfMonth;
  
  if (totalSpent <= expectedSpend) {
    return dayOfMonth;
  }
  return 0;
}

function calculateNoImpulseStreak(expenses: Expense[], today: Date): number {
  let streak = 0;
  
  for (let i = 0; i < 30; i++) {
    const checkDate = subDays(today, i);
    const dayExpenses = expenses.filter(e => {
      const expenseDate = startOfDay(parseISO(e.date));
      return expenseDate.getTime() === checkDate.getTime();
    });
    
    const hasImpulse = dayExpenses.some(e => 
      DISCRETIONARY_CATEGORIES.includes(e.category) && e.amount > 50
    );
    
    if (hasImpulse) break;
    streak++;
  }
  
  return streak;
}

function calculateTrackingStreak(expenses: Expense[], today: Date): number {
  let streak = 0;
  
  for (let i = 0; i < 30; i++) {
    const checkDate = subDays(today, i);
    const hasExpense = expenses.some(e => {
      const expenseDate = startOfDay(parseISO(e.date));
      return expenseDate.getTime() === checkDate.getTime();
    });
    
    if (!hasExpense && i > 0) break;
    if (hasExpense) streak++;
  }
  
  return streak;
}

function StreakRiver({ streak, index }: { streak: StreakData; index: number }) {
  const { theme } = useTheme();
  const flowProgress = useSharedValue(0);

  React.useEffect(() => {
    flowProgress.value = withRepeat(
      withTiming(1, { duration: 3000 + index * 500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const flowStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + flowProgress.value * 0.4,
  }));

  return (
    <View style={styles.streakItem}>
      <Animated.View 
        style={[
          styles.streakIcon, 
          { backgroundColor: streak.color + "20" },
          flowStyle
        ]}
      >
        <Feather name={streak.icon} size={20} color={streak.color} />
      </Animated.View>
      <View style={styles.streakContent}>
        <View style={styles.streakHeader}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>{streak.label}</ThemedText>
          <View style={[styles.daysBadge, { backgroundColor: streak.color + "15" }]}>
            <ThemedText type="small" style={{ color: streak.color, fontWeight: "600" }}>
              {streak.days} days
            </ThemedText>
          </View>
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {streak.description}
        </ThemedText>
      </View>
    </View>
  );
}

export function SteadyProgress() {
  const { theme } = useTheme();
  const { data } = useApp();

  const streaks = useMemo(() => {
    if (!data) return [];
    return calculateStreaks(data.expenses, data.categoryBudgets);
  }, [data?.expenses, data?.categoryBudgets]);

  if (streaks.length === 0) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <ThemedText type="heading">Steady Progress</ThemedText>
          <Feather name="activity" size={20} color={theme.textSecondary} />
        </View>
        <View style={styles.emptyState}>
          <Feather name="sun" size={32} color={theme.textSecondary} />
          <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
            Keep tracking expenses to build your first streak
          </ThemedText>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="heading">Steady Progress</ThemedText>
        <Feather name="activity" size={20} color={theme.primary} />
      </View>
      
      <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
        Your consistency is building something beautiful
      </ThemedText>
      
      <View style={styles.streaksList}>
        {streaks.map((streak, index) => (
          <StreakRiver key={streak.type} streak={streak} index={index} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  streaksList: {
    gap: Spacing.md,
  },
  streakItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  streakIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  streakContent: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  streakHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  daysBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.full,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
  },
});
