import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  interpolateColor,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { differenceInHours } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getCurrentMonthExpenses } from "@/lib/storage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Goal, Expense } from "@/types";

const HARMONY_COLORS = {
  indigo: "#6366F1",
  indigoLight: "#818CF8",
  gold: "#F59E0B",
  goldLight: "#FBBF24",
  amber: "#D97706",
  amberLight: "#F59E0B",
  purple: "#A855F7",
  emerald: "#10B981",
};

const EGO_CATEGORIES = ["shopping", "entertainment", "restaurants", "personal", "gifts"];
const ESSENTIAL_CATEGORIES = ["groceries", "utilities", "internet", "transport", "health"];

interface HarmonySparkProps {
  onPress?: () => void;
}

function calculateEgoVsDreamRatio(expenses: Expense[], goals: Goal[]): number {
  const monthlyExpenses = getCurrentMonthExpenses(expenses);
  
  const egoSpending = monthlyExpenses
    .filter(e => EGO_CATEGORIES.includes(e.category))
    .reduce((sum, e) => sum + e.amount, 0);
  
  const totalSaved = goals.reduce((sum, g) => sum + g.savedAmount, 0);
  
  if (egoSpending === 0 && totalSaved === 0) return 0.5;
  if (egoSpending === 0) return 1;
  if (totalSaved === 0) return 0;
  
  const ratio = totalSaved / (totalSaved + egoSpending);
  return Math.max(0, Math.min(1, ratio));
}

function calculateFutureValue(presentValue: number, years: number = 10, rate: number = 0.07): number {
  return presentValue * Math.pow(1 + rate, years);
}

function getLastDreamDepositTime(goals: Goal[]): Date | null {
  let latestDate: Date | null = null;
  
  goals.forEach(goal => {
    goal.contributions.forEach(contribution => {
      const date = new Date(contribution.date);
      if (!latestDate || date > latestDate) {
        latestDate = date;
      }
    });
  });
  
  return latestDate;
}

function getCommitmentHeartStatus(goals: Goal[]): { hoursRemaining: number; isHealthy: boolean; isCracking: boolean } {
  const lastDeposit = getLastDreamDepositTime(goals);
  
  if (!lastDeposit) {
    return { hoursRemaining: 0, isHealthy: false, isCracking: true };
  }
  
  const hoursSinceDeposit = differenceInHours(new Date(), lastDeposit);
  const hoursRemaining = Math.max(0, 72 - hoursSinceDeposit);
  
  return {
    hoursRemaining,
    isHealthy: hoursSinceDeposit < 48,
    isCracking: hoursSinceDeposit >= 72,
  };
}

export function HarmonySpark({ onPress }: HarmonySparkProps) {
  const { theme } = useTheme();
  const { data } = useApp();
  const [showFutureValue, setShowFutureValue] = useState(false);
  
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.6);
  const colorProgress = useSharedValue(0);
  const heartScale = useSharedValue(1);
  
  const harmonyData = useMemo(() => {
    if (!data) return { ratio: 0.5, totalSaved: 0, egoSpending: 0, commitmentHeart: { hoursRemaining: 0, isHealthy: false, isCracking: true } };
    
    const ratio = calculateEgoVsDreamRatio(data.expenses, data.goals);
    const totalSaved = data.goals.reduce((sum, g) => sum + g.savedAmount, 0);
    const monthlyExpenses = getCurrentMonthExpenses(data.expenses);
    const egoSpending = monthlyExpenses
      .filter(e => EGO_CATEGORIES.includes(e.category))
      .reduce((sum, e) => sum + e.amount, 0);
    const commitmentHeart = getCommitmentHeartStatus(data.goals);
    
    return { ratio, totalSaved, egoSpending, commitmentHeart };
  }, [data]);
  
  const futureValue = useMemo(() => {
    return calculateFutureValue(harmonyData.totalSaved);
  }, [harmonyData.totalSaved]);
  
  useEffect(() => {
    const intensity = harmonyData.ratio;
    const pulseSpeed = 2000 + (1 - intensity) * 1000;
    
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: pulseSpeed / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: pulseSpeed / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8 + intensity * 0.2, { duration: pulseSpeed / 2 }),
        withTiming(0.5 + intensity * 0.3, { duration: pulseSpeed / 2 })
      ),
      -1,
      true
    );
    
    colorProgress.value = withTiming(harmonyData.ratio, { duration: 1000 });
    
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(glowOpacity);
    };
  }, [harmonyData.ratio]);
  
  useEffect(() => {
    if (!harmonyData.commitmentHeart.isHealthy) {
      heartScale.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 200 }),
          withSpring(1, { damping: 3, stiffness: 200 })
        ),
        3,
        false
      );
    }
  }, [harmonyData.commitmentHeart.isHealthy]);
  
  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  
  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: pulseScale.value * 1.3 }],
  }));
  
  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));
  
  const getGradientColors = (): [string, string, string] => {
    const ratio = harmonyData.ratio;
    if (ratio >= 0.6) {
      return [HARMONY_COLORS.gold, HARMONY_COLORS.goldLight, HARMONY_COLORS.emerald];
    } else if (ratio >= 0.3) {
      return [HARMONY_COLORS.indigo, HARMONY_COLORS.indigoLight, HARMONY_COLORS.purple];
    } else {
      return [HARMONY_COLORS.amber, HARMONY_COLORS.amberLight, HARMONY_COLORS.gold];
    }
  };
  
  const getHarmonyMessage = (): string => {
    const ratio = harmonyData.ratio;
    if (ratio >= 0.7) return "Your Spark is radiant! Keep nurturing your dreams.";
    if (ratio >= 0.5) return "Good balance! Small shifts can make your Spark glow brighter.";
    if (ratio >= 0.3) return "Your Spark needs attention. Consider redirecting some spending.";
    return "Time to reconnect with your dreams. Every little bit helps!";
  };
  
  const handleToggleFutureValue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowFutureValue(!showFutureValue);
  };
  
  const gradientColors = getGradientColors();
  const percentageLabel = Math.round(harmonyData.ratio * 100);
  
  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="heading">The Harmony Spark</ThemedText>
        <Pressable onPress={handleToggleFutureValue} style={styles.futureToggle}>
          <Feather
            name={showFutureValue ? "eye" : "eye-off"}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>
      </View>
      
      <Pressable onPress={onPress} style={styles.orbContainer}>
        <Animated.View style={[styles.glow, glowAnimatedStyle]}>
          <LinearGradient
            colors={[gradientColors[0] + "40", gradientColors[1] + "20", "transparent"]}
            style={styles.glowGradient}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>
        
        <Animated.View style={[styles.orb, orbAnimatedStyle]}>
          <LinearGradient
            colors={gradientColors}
            style={styles.orbGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.orbInner}>
              <ThemedText type="h2" style={styles.orbText}>
                {percentageLabel}%
              </ThemedText>
              <ThemedText type="tiny" style={styles.orbLabel}>
                Harmony
              </ThemedText>
            </View>
          </LinearGradient>
        </Animated.View>
      </Pressable>
      
      <ThemedText type="small" style={[styles.message, { color: theme.textSecondary }]}>
        {getHarmonyMessage()}
      </ThemedText>
      
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <View style={styles.statHeader}>
            <Feather name="target" size={14} color={HARMONY_COLORS.emerald} />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginLeft: 4 }}>
              {showFutureValue ? "10-Year Value" : "Dreams Saved"}
            </ThemedText>
          </View>
          <ThemedText type="heading" style={{ color: HARMONY_COLORS.emerald }}>
            ${showFutureValue ? Math.round(futureValue).toLocaleString() : harmonyData.totalSaved.toLocaleString()}
          </ThemedText>
          {showFutureValue ? (
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              at 7% growth
            </ThemedText>
          ) : null}
        </View>
        
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        
        <View style={styles.stat}>
          <View style={styles.statHeader}>
            <Feather name="shopping-bag" size={14} color={HARMONY_COLORS.amber} />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginLeft: 4 }}>
              Ego Spending
            </ThemedText>
          </View>
          <ThemedText type="heading" style={{ color: HARMONY_COLORS.amber }}>
            ${harmonyData.egoSpending.toLocaleString()}
          </ThemedText>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
            this month
          </ThemedText>
        </View>
        
        <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
        
        <Animated.View style={[styles.stat, heartAnimatedStyle]}>
          <View style={styles.statHeader}>
            <Feather
              name="heart"
              size={14}
              color={harmonyData.commitmentHeart.isCracking ? theme.error : theme.primary}
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginLeft: 4 }}>
              Commitment
            </ThemedText>
          </View>
          {harmonyData.commitmentHeart.isCracking ? (
            <>
              <ThemedText type="heading" style={{ color: theme.error }}>
                Needs Love
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.error }}>
                No deposits in 72h+
              </ThemedText>
            </>
          ) : (
            <>
              <ThemedText type="heading" style={{ color: theme.primary }}>
                {Math.round(harmonyData.commitmentHeart.hoursRemaining)}h
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                until next deposit
              </ThemedText>
            </>
          )}
        </Animated.View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  futureToggle: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  orbContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: 180,
    marginBottom: Spacing.lg,
  },
  glow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  glowGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 100,
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: "hidden",
  },
  orbGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  orbInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  orbText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  orbLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  message: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statDivider: {
    width: 1,
    height: 50,
    marginHorizontal: Spacing.sm,
  },
});
