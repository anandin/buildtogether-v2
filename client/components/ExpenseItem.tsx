import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/types";

export interface EgoSpendNudge {
  expenseId: string;
  nudgeMessage: string;
  vanishPotential: number;
  egoCategory: "luxury" | "impulse" | "convenience" | "status" | "habitual";
}

interface ExpenseItemProps {
  expense: Expense;
  partnerName: string;
  onPress?: () => void;
  egoNudge?: EgoSpendNudge;
  onVanish?: (expense: Expense, redirectAmount: number) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EGO_ICONS: Record<string, string> = {
  luxury: "star",
  impulse: "zap",
  convenience: "coffee",
  status: "award",
  habitual: "repeat",
};

const EGO_COLORS: Record<string, string> = {
  luxury: "#A855F7",
  impulse: "#F59E0B",
  convenience: "#6366F1",
  status: "#EC4899",
  habitual: "#8B5CF6",
};

export function ExpenseItem({ expense, partnerName, onPress, egoNudge, onVanish }: ExpenseItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const vanishScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const vanishButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: vanishScale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handleVanish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    vanishScale.value = withSequence(
      withSpring(0.8, { damping: 10 }),
      withSpring(1.1, { damping: 8 }),
      withSpring(1, { damping: 12 })
    );
    if (onVanish && egoNudge) {
      onVanish(expense, expense.amount);
    }
  };

  const categoryColor = CATEGORY_COLORS[expense.category] || "#999999";
  const categoryIcon = CATEGORY_ICONS[expense.category] as any || "more-horizontal";
  const egoIcon = egoNudge ? (EGO_ICONS[egoNudge.egoCategory] as any) : undefined;
  const egoColor = egoNudge ? EGO_COLORS[egoNudge.egoCategory] : undefined;

  return (
    <View>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.container,
          { backgroundColor: theme.backgroundDefault },
          egoNudge ? { borderLeftWidth: 3, borderLeftColor: egoColor } : null,
          animatedStyle,
        ]}
      >
        <View
          style={[styles.iconContainer, { backgroundColor: categoryColor + "20" }]}
        >
          <Feather name={categoryIcon} size={20} color={categoryColor} />
        </View>

        <View style={styles.content}>
          <View style={styles.descriptionRow}>
            <ThemedText type="body" numberOfLines={1} style={styles.description}>
              {expense.description}
            </ThemedText>
            {egoNudge ? (
              <View style={[styles.egoBadge, { backgroundColor: egoColor + "20" }]}>
                <Feather name={egoIcon as any} size={10} color={egoColor} />
              </View>
            ) : null}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {format(new Date(expense.date), "MMM d")} • {partnerName}
          </ThemedText>
        </View>

        <View style={styles.amountContainer}>
          <ThemedText type="heading" style={{ color: theme.primary }}>
            ${expense.amount.toFixed(2)}
          </ThemedText>
          {expense.splitMethod === "even" ? (
            <View style={styles.splitBadge}>
              <Feather name="users" size={10} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 2 }}>
                50/50
              </ThemedText>
            </View>
          ) : null}
        </View>
      </AnimatedPressable>

      {egoNudge && onVanish ? (
        <View style={[styles.nudgeContainer, { backgroundColor: egoColor + "10" }]}>
          <View style={styles.nudgeContent}>
            <Feather name="star" size={14} color={egoColor} />
            <ThemedText type="small" style={[styles.nudgeText, { color: theme.text }]} numberOfLines={2}>
              {egoNudge.nudgeMessage}
            </ThemedText>
          </View>
          <Animated.View style={vanishButtonStyle}>
            <Pressable
              onPress={handleVanish}
              style={[styles.vanishButton, { backgroundColor: egoColor || theme.primary }]}
            >
              <Feather name="target" size={12} color="#FFFFFF" />
              <ThemedText type="small" style={styles.vanishText}>
                Vanish to Dream
              </ThemedText>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  descriptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  description: {
    marginBottom: 2,
    flex: 1,
  },
  egoBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  amountContainer: {
    alignItems: "flex-end",
  },
  splitBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  nudgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    marginLeft: Spacing.xl,
    marginRight: Spacing.xs,
  },
  nudgeContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginRight: Spacing.md,
  },
  nudgeText: {
    flex: 1,
  },
  vanishButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  vanishText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
