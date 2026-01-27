import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/types";

interface ExpenseItemProps {
  expense: Expense;
  partnerName: string;
  onPress?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ExpenseItem({ expense, partnerName, onPress }: ExpenseItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const categoryColor = CATEGORY_COLORS[expense.category];
  const categoryIcon = CATEGORY_ICONS[expense.category] as any;

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
      <View
        style={[styles.iconContainer, { backgroundColor: categoryColor + "20" }]}
      >
        <Feather name={categoryIcon} size={20} color={categoryColor} />
      </View>

      <View style={styles.content}>
        <ThemedText type="body" numberOfLines={1} style={styles.description}>
          {expense.description}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {format(new Date(expense.date), "MMM d")} • {partnerName}
        </ThemedText>
      </View>

      <View style={styles.amountContainer}>
        <ThemedText type="heading" style={{ color: theme.primary }}>
          ${expense.amount.toFixed(2)}
        </ThemedText>
        {expense.splitMethod === "equal" ? (
          <View style={styles.splitBadge}>
            <Feather name="users" size={10} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 2 }}>
              50/50
            </ThemedText>
          </View>
        ) : null}
      </View>
    </AnimatedPressable>
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
  description: {
    marginBottom: 2,
  },
  amountContainer: {
    alignItems: "flex-end",
  },
  splitBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
});
