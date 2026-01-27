import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface QuickActionProps {
  icon: string;
  label: string;
  color: string;
  onPress: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function QuickActionButton({ icon, label, color, onPress }: QuickActionProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.button,
        { backgroundColor: theme.backgroundDefault },
        animatedStyle,
      ]}
    >
      <View style={[styles.iconWrapper, { backgroundColor: color + "15" }]}>
        <Feather name={icon as any} size={22} color={color} />
      </View>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>
    </AnimatedPressable>
  );
}

interface QuickActionsProps {
  onAddExpense: () => void;
  onScanReceipt: () => void;
  onAddGoal: () => void;
}

export function QuickActions({
  onAddExpense,
  onScanReceipt,
  onAddGoal,
}: QuickActionsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <QuickActionButton
        icon="plus-circle"
        label="Add Expense"
        color={theme.primary}
        onPress={onAddExpense}
      />
      <QuickActionButton
        icon="camera"
        label="Scan Receipt"
        color={theme.accent}
        onPress={onScanReceipt}
      />
      <QuickActionButton
        icon="target"
        label="New Goal"
        color={theme.success}
        onPress={onAddGoal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  button: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    ...Shadows.card,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  label: {
    textAlign: "center",
  },
});
