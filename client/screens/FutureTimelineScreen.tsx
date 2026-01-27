import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format, addMonths, differenceInMonths } from "date-fns";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Circle, Path } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Goal } from "@/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TIMELINE_HEIGHT = 200;
const NODE_SIZE = 48;

interface TimelineGoal extends Goal {
  projectedDate: Date;
  monthsAway: number;
}

function calculateProjectedDate(goal: Goal, monthlySavingsRate: number): Date {
  const remaining = goal.targetAmount - goal.savedAmount;
  if (remaining <= 0) return new Date();
  
  const monthsNeeded = Math.ceil(remaining / Math.max(monthlySavingsRate, 50));
  return addMonths(new Date(), monthsNeeded);
}

function calculateMonthlySavingsRate(goals: Goal[]): number {
  const now = new Date();
  const threeMonthsAgo = addMonths(now, -3);
  
  let totalContributions = 0;
  goals.forEach(goal => {
    goal.contributions.forEach(c => {
      const contributionDate = new Date(c.date);
      if (contributionDate >= threeMonthsAgo) {
        totalContributions += c.amount;
      }
    });
  });
  
  return totalContributions / 3 || 100;
}

function TimelineNode({ 
  goal, 
  index, 
  totalCount,
  onPress 
}: { 
  goal: TimelineGoal; 
  index: number;
  totalCount: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  
  const progress = goal.savedAmount / goal.targetAmount;
  const isComplete = progress >= 1;
  
  const horizontalPosition = ((index + 1) / (totalCount + 1)) * (SCREEN_WIDTH - Spacing.xl * 2);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.nodeContainer,
        { left: horizontalPosition - NODE_SIZE / 2 }
      ]}
    >
      <Animated.View style={animatedStyle}>
        <View 
          style={[
            styles.node, 
            { 
              backgroundColor: isComplete ? theme.success : goal.color,
              borderColor: theme.backgroundSecondary,
            }
          ]}
        >
          <ThemedText style={styles.nodeEmoji}>{goal.emoji}</ThemedText>
        </View>
        <View style={styles.nodeLabel}>
          <ThemedText type="small" style={{ fontWeight: "600", textAlign: "center" }} numberOfLines={1}>
            {goal.name}
          </ThemedText>
          <ThemedText type="tiny" style={{ color: theme.textSecondary, textAlign: "center" }}>
            {isComplete ? "Complete!" : format(goal.projectedDate, "MMM yyyy")}
          </ThemedText>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function HorizonLine({ goalCount }: { goalCount: number }) {
  const { theme } = useTheme();
  
  return (
    <View style={styles.horizonContainer}>
      <View style={[styles.horizonLine, { backgroundColor: theme.border }]} />
      <View style={[styles.horizonGlow, { backgroundColor: theme.primary + "30" }]} />
    </View>
  );
}

export function FutureTimelineScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { data } = useApp();

  const timelineGoals = useMemo(() => {
    if (!data?.goals || data.goals.length === 0) return [];
    
    const monthlySavingsRate = calculateMonthlySavingsRate(data.goals);
    
    return data.goals
      .map(goal => {
        const projectedDate = calculateProjectedDate(goal, monthlySavingsRate);
        return {
          ...goal,
          projectedDate,
          monthsAway: differenceInMonths(projectedDate, new Date()),
        };
      })
      .sort((a, b) => a.monthsAway - b.monthsAway);
  }, [data?.goals]);

  const monthlySavingsRate = useMemo(() => {
    if (!data?.goals) return 0;
    return calculateMonthlySavingsRate(data.goals);
  }, [data?.goals]);

  const totalProjectedSavings = useMemo(() => {
    if (!data?.goals || data.goals.length === 0) return 0;
    const longestGoal = timelineGoals[timelineGoals.length - 1];
    if (!longestGoal) return 0;
    return monthlySavingsRate * longestGoal.monthsAway;
  }, [timelineGoals, monthlySavingsRate]);

  const handleGoalPress = useCallback((goalId: string) => {
    (navigation as any).navigate("GoalDetail", { goalId });
  }, [navigation]);

  if (!data || timelineGoals.length === 0) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <View style={styles.emptyState}>
          <Feather name="sunrise" size={64} color={theme.textSecondary} />
          <ThemedText type="heading" style={styles.emptyTitle}>
            Your Future Awaits
          </ThemedText>
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add savings goals to see your future timeline unfold
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing.xl }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerSection}>
          <ThemedText type="h3">Your Horizon</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
            At your current pace, here's when dreams become reality
          </ThemedText>
        </View>

        <Card style={styles.paceCard}>
          <View style={styles.paceRow}>
            <View style={styles.paceItem}>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Monthly Savings Pace
              </ThemedText>
              <ThemedText type="h4" style={{ color: theme.success }}>
                ${monthlySavingsRate.toFixed(0)}
              </ThemedText>
            </View>
            <View style={[styles.paceDivider, { backgroundColor: theme.border }]} />
            <View style={styles.paceItem}>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Goals in Progress
              </ThemedText>
              <ThemedText type="h4" style={{ color: theme.primary }}>
                {timelineGoals.filter(g => g.savedAmount < g.targetAmount).length}
              </ThemedText>
            </View>
          </View>
        </Card>

        <View style={styles.timelineSection}>
          <View style={styles.timelineContainer}>
            <HorizonLine goalCount={timelineGoals.length} />
            
            <View style={styles.nodesRow}>
              {timelineGoals.map((goal, index) => (
                <TimelineNode
                  key={goal.id}
                  goal={goal}
                  index={index}
                  totalCount={timelineGoals.length}
                  onPress={() => handleGoalPress(goal.id)}
                />
              ))}
            </View>

            <View style={styles.nowMarker}>
              <View style={[styles.nowDot, { backgroundColor: theme.primary }]} />
              <ThemedText type="tiny" style={{ color: theme.primary }}>Now</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.goalsListSection}>
          <ThemedText type="heading" style={styles.sectionTitle}>
            Journey Details
          </ThemedText>
          
          {timelineGoals.map((goal) => {
            const progress = goal.savedAmount / goal.targetAmount;
            const remaining = goal.targetAmount - goal.savedAmount;
            const isComplete = progress >= 1;
            
            return (
              <Card 
                key={goal.id} 
                style={styles.goalCard}
                onPress={() => handleGoalPress(goal.id)}
              >
                <View style={styles.goalHeader}>
                  <View style={[styles.goalEmoji, { backgroundColor: goal.color + "20" }]}>
                    <ThemedText style={{ fontSize: 24 }}>{goal.emoji}</ThemedText>
                  </View>
                  <View style={styles.goalInfo}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{goal.name}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {isComplete 
                        ? "Goal reached!" 
                        : `${format(goal.projectedDate, "MMMM yyyy")} • ${goal.monthsAway} months away`
                      }
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                </View>
                
                <View style={styles.goalProgress}>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View 
                      style={[
                        styles.progressFill, 
                        { 
                          width: `${Math.min(progress * 100, 100)}%`,
                          backgroundColor: isComplete ? theme.success : goal.color,
                        }
                      ]} 
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                      ${goal.savedAmount.toFixed(0)} saved
                    </ThemedText>
                    <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                      ${goal.targetAmount.toFixed(0)} goal
                    </ThemedText>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

        <Card style={styles.insightCard}>
          <View style={styles.insightIcon}>
            <Feather name="sunrise" size={24} color={theme.warning} />
          </View>
          <ThemedText type="body" style={styles.insightText}>
            If you maintain your current pace, you'll save{" "}
            <ThemedText style={{ fontWeight: "600", color: theme.success }}>
              ${totalProjectedSavings.toFixed(0)}
            </ThemedText>
            {" "}by the time you complete all your goals.
          </ThemedText>
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  headerSection: {
    marginBottom: Spacing.lg,
  },
  paceCard: {
    marginBottom: Spacing.xl,
  },
  paceRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  paceItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.xs,
  },
  paceDivider: {
    width: 1,
    height: 40,
    marginHorizontal: Spacing.md,
  },
  timelineSection: {
    marginBottom: Spacing.xl,
  },
  timelineContainer: {
    height: TIMELINE_HEIGHT,
    position: "relative",
  },
  horizonContainer: {
    position: "absolute",
    top: NODE_SIZE / 2 + 20,
    left: 0,
    right: 0,
    height: 4,
  },
  horizonLine: {
    height: 2,
    borderRadius: 1,
  },
  horizonGlow: {
    position: "absolute",
    top: -4,
    left: 0,
    right: 0,
    height: 10,
    borderRadius: 5,
  },
  nodesRow: {
    position: "relative",
    height: NODE_SIZE + 60,
  },
  nodeContainer: {
    position: "absolute",
    top: 0,
    alignItems: "center",
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  nodeEmoji: {
    fontSize: 20,
  },
  nodeLabel: {
    marginTop: Spacing.sm,
    width: 80,
    alignItems: "center",
  },
  nowMarker: {
    position: "absolute",
    bottom: 20,
    left: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs / 2,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  goalsListSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  goalCard: {
    marginBottom: Spacing.md,
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  goalEmoji: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  goalInfo: {
    flex: 1,
    gap: Spacing.xs / 2,
  },
  goalProgress: {
    gap: Spacing.xs,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  insightCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  insightIcon: {
    marginTop: 2,
  },
  insightText: {
    flex: 1,
    lineHeight: 22,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    marginTop: Spacing.md,
  },
  emptyText: {
    textAlign: "center",
  },
});
