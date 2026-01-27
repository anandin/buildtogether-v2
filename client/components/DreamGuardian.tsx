import React, { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { differenceInDays, differenceInHours } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses } from "@/lib/storage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Goal, Expense } from "@/types";

const EGO_CATEGORIES = ["shopping", "entertainment", "restaurants", "personal", "gifts"];

interface DreamGuardianProps {
  onAddToGoal?: () => void;
}

interface GuardianMood {
  emoji: string;
  color: string;
  message: string;
  suggestion: string;
  priority: "celebrate" | "encourage" | "gentle-nudge" | "urgent";
}

function getLastDepositDays(goals: Goal[]): number | null {
  let latestDate: Date | null = null;
  
  goals.forEach(goal => {
    goal.contributions.forEach(contribution => {
      const date = new Date(contribution.date);
      if (!latestDate || date > latestDate) {
        latestDate = date;
      }
    });
  });
  
  if (!latestDate) return null;
  return differenceInDays(new Date(), latestDate);
}

function getEgoSpendingThisWeek(expenses: Expense[]): number {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  return expenses
    .filter(e => new Date(e.date) >= weekAgo && EGO_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);
}

function getTotalSaved(goals: Goal[]): number {
  return goals.reduce((sum, g) => sum + g.savedAmount, 0);
}

function getGuardianMood(
  goals: Goal[],
  expenses: Expense[],
  partnerNames: { partner1: string; partner2: string }
): GuardianMood {
  const totalSaved = getTotalSaved(goals);
  const daysSinceDeposit = getLastDepositDays(goals);
  const weeklyEgoSpending = getEgoSpendingThisWeek(expenses);
  const hasGoals = goals.length > 0;
  
  if (!hasGoals) {
    return {
      emoji: "target",
      color: "#6366F1",
      message: `Hey ${partnerNames.partner1} & ${partnerNames.partner2}! Ready to dream together?`,
      suggestion: "Tap Goals to create your first shared dream - a vacation, home project, or anything you want to save for together!",
      priority: "encourage",
    };
  }
  
  if (totalSaved > 0 && (daysSinceDeposit === null || daysSinceDeposit <= 3)) {
    const nearestGoal = goals.reduce((prev, curr) => {
      const prevProgress = prev.savedAmount / prev.targetAmount;
      const currProgress = curr.savedAmount / curr.targetAmount;
      return currProgress > prevProgress ? curr : prev;
    });
    const progress = Math.round((nearestGoal.savedAmount / nearestGoal.targetAmount) * 100);
    
    return {
      emoji: "sun",
      color: "#10B981",
      message: `You're doing amazing! Your "${nearestGoal.name}" dream is ${progress}% there.`,
      suggestion: progress >= 75 
        ? "You're so close! Just a little more and this dream becomes reality."
        : "Keep this momentum going - every contribution brings you closer!",
      priority: "celebrate",
    };
  }
  
  if (daysSinceDeposit !== null && daysSinceDeposit > 7) {
    return {
      emoji: "heart",
      color: "#F59E0B",
      message: `It's been ${daysSinceDeposit} days since your last dream deposit...`,
      suggestion: "Your dreams are waiting! Even $5 keeps the spark alive. Want to add a little something today?",
      priority: "gentle-nudge",
    };
  }
  
  if (weeklyEgoSpending > 200) {
    const formattedAmount = weeklyEgoSpending.toFixed(0);
    return {
      emoji: "alert-circle",
      color: "#EF4444",
      message: `Heads up: $${formattedAmount} on nice-to-haves this week.`,
      suggestion: "No judgment! But imagine if even half of that went to your dreams. Want to redirect some?",
      priority: "urgent",
    };
  }
  
  if (weeklyEgoSpending > 100) {
    return {
      emoji: "zap",
      color: "#8B5CF6",
      message: "You're balancing treats and dreams nicely!",
      suggestion: "A small top-up to your goals would make this week even better.",
      priority: "encourage",
    };
  }
  
  return {
    emoji: "smile",
    color: "#6366F1",
    message: "Looking good! You're being mindful with your spending.",
    suggestion: "Ready to grow your dreams a little more today?",
    priority: "encourage",
  };
}

export function DreamGuardian({ onAddToGoal }: DreamGuardianProps) {
  const { theme } = useTheme();
  const { data } = useApp();
  
  const breatheScale = useSharedValue(1);
  
  React.useEffect(() => {
    breatheScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);
  
  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breatheScale.value }],
  }));
  
  const guardianMood = useMemo(() => {
    if (!data) {
      return {
        emoji: "smile",
        color: "#6366F1",
        message: "Welcome! Let's start your journey together.",
        suggestion: "Add your first expense or goal to get started.",
        priority: "encourage" as const,
      };
    }
    
    return getGuardianMood(
      data.goals,
      data.expenses,
      {
        partner1: data.partners.partner1?.name || "You",
        partner2: data.partners.partner2?.name || "Partner",
      }
    );
  }, [data]);
  
  const totalSaved = useMemo(() => {
    if (!data) return 0;
    return getTotalSaved(data.goals);
  }, [data]);
  
  const handleAddToGoal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddToGoal?.();
  };
  
  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Animated.View 
            style={[
              styles.iconContainer, 
              { backgroundColor: guardianMood.color + "20" },
              breatheStyle
            ]}
          >
            <Feather name={guardianMood.emoji as any} size={24} color={guardianMood.color} />
          </Animated.View>
          <View style={styles.titleText}>
            <ThemedText type="heading">Dream Guardian</ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Your savings ally
            </ThemedText>
          </View>
        </View>
        
        {totalSaved > 0 ? (
          <View style={[styles.savedBadge, { backgroundColor: theme.success + "15" }]}>
            <ThemedText type="small" style={{ color: theme.success, fontWeight: "600" }}>
              ${totalSaved.toFixed(0)} saved
            </ThemedText>
          </View>
        ) : null}
      </View>
      
      <View style={[styles.messageContainer, { backgroundColor: guardianMood.color + "08" }]}>
        <ThemedText type="body" style={styles.message}>
          {guardianMood.message}
        </ThemedText>
        <ThemedText type="small" style={[styles.suggestion, { color: theme.textSecondary }]}>
          {guardianMood.suggestion}
        </ThemedText>
      </View>
      
      {(guardianMood.priority === "gentle-nudge" || guardianMood.priority === "urgent") ? (
        <Pressable
          style={[styles.actionButton, { backgroundColor: guardianMood.color }]}
          onPress={handleAddToGoal}
        >
          <Feather name="plus-circle" size={18} color="#FFFFFF" />
          <ThemedText type="body" style={styles.actionButtonText}>
            Add to Dreams
          </ThemedText>
        </Pressable>
      ) : null}
      
      <View style={styles.quickStats}>
        <View style={styles.stat}>
          <Feather name="target" size={16} color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {data?.goals.length || 0} dreams
          </ThemedText>
        </View>
        <View style={styles.stat}>
          <Feather name="trending-up" size={16} color={theme.success} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {data?.goals.filter(g => g.savedAmount >= g.targetAmount * 0.5).length || 0} halfway+
          </ThemedText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  titleText: {
    gap: 2,
  },
  savedBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  messageContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  message: {
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },
  suggestion: {
    lineHeight: 20,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  quickStats: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
});
