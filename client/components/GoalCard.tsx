import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Goal } from "@/types";

interface GoalCardProps {
  goal: Goal;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GoalCard({ goal, onPress }: GoalCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const progress = goal.targetAmount > 0 
    ? Math.min(goal.savedAmount / goal.targetAmount, 1) 
    : 0;
  const percentage = Math.round(progress * 100);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.container,
        { backgroundColor: theme.backgroundDefault },
        animatedStyle,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: goal.color + "20" }]}>
        <Feather name={goal.emoji as any} size={24} color={goal.color} />
      </View>

      <ThemedText type="heading" numberOfLines={1} style={styles.name}>
        {goal.name}
      </ThemedText>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: goal.color,
                width: `${percentage}%`,
              },
            ]}
          />
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {percentage}%
        </ThemedText>
      </View>

      <View style={styles.amountContainer}>
        <ThemedText type="h4" style={{ color: goal.color }}>
          ${goal.savedAmount.toLocaleString()}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          of ${goal.targetAmount.toLocaleString()}
        </ThemedText>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    minWidth: 150,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  name: {
    marginBottom: Spacing.md,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  amountContainer: {
    gap: 2,
  },
});
