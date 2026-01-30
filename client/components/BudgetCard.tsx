import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedProps,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface BudgetCardProps {
  spent: number;
  limit: number;
  month: string;
  onPress?: () => void;
  compact?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function BudgetCard({ spent, limit, month, onPress, compact }: BudgetCardProps) {
  const { theme } = useTheme();
  const progress = useSharedValue(0);
  const percentage = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const remaining = Math.max(limit - spent, 0);

  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    progress.value = withTiming(percentage, { duration: 1000 });
  }, [percentage]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const getProgressColor = () => {
    if (percentage >= 0.9) return theme.error;
    if (percentage >= 0.75) return theme.warning;
    return theme.success;
  };

  if (compact) {
    return (
      <Card style={styles.compactCard} onPress={onPress}>
        <View style={styles.compactContent}>
          <View style={styles.compactProgress}>
            <View 
              style={[
                styles.compactProgressBar, 
                { backgroundColor: theme.border }
              ]}
            >
              <Animated.View
                style={[
                  styles.compactProgressFill,
                  { 
                    backgroundColor: getProgressColor(),
                    width: `${Math.min(percentage * 100, 100)}%`,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.compactStats}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>
              ${spent.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              of ${limit.toLocaleString()} this month
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: getProgressColor(), fontWeight: "600" }}>
            ${remaining.toLocaleString()} left
          </ThemedText>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <View>
          <ThemedText type="heading" style={styles.title}>
            {month} Budget
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Track your spending together
          </ThemedText>
        </View>
        <Feather name="trending-up" size={20} color={theme.primary} />
      </View>

      <View style={styles.content}>
        <View style={styles.progressContainer}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.border}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={getProgressColor()}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              animatedProps={animatedProps}
              strokeLinecap="round"
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={styles.progressText}>
            <ThemedText type="h3" style={styles.spentAmount}>
              ${spent.toLocaleString()}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              of ${limit.toLocaleString()}
            </ThemedText>
          </View>
        </View>

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <View
              style={[styles.statDot, { backgroundColor: theme.success }]}
            />
            <View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Remaining
              </ThemedText>
              <ThemedText type="heading">${remaining.toLocaleString()}</ThemedText>
            </View>
          </View>
          <View style={styles.statItem}>
            <View
              style={[styles.statDot, { backgroundColor: theme.primary }]}
            />
            <View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Daily avg
              </ThemedText>
              <ThemedText type="heading">
                ${Math.round(remaining / 30).toLocaleString()}
              </ThemedText>
            </View>
          </View>
        </View>
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
    alignItems: "flex-start",
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: {
    position: "absolute",
    alignItems: "center",
  },
  spentAmount: {
    marginBottom: -4,
  },
  stats: {
    flex: 1,
    marginLeft: Spacing.xl,
    gap: Spacing.lg,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactCard: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  compactContent: {
    gap: Spacing.sm,
  },
  compactProgress: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactProgressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  compactProgressFill: {
    height: "100%",
    borderRadius: 4,
  },
  compactStats: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
});
