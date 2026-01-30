import React, { useState } from "react";
import { View, StyleSheet, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface FloatingActionButtonProps {
  onAddExpense: () => void;
  onScanReceipt: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function FloatingActionButton({
  onAddExpense,
  onScanReceipt,
}: FloatingActionButtonProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [isOpen, setIsOpen] = useState(false);
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const menuOpacity = useSharedValue(0);
  
  const fabBottom = tabBarHeight + Spacing.md;

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const animatedMenuStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [
      { translateY: interpolate(menuOpacity.value, [0, 1], [20, 0]) },
    ],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsOpen(!isOpen);
    rotation.value = withSpring(isOpen ? 0 : 45, { damping: 12 });
    menuOpacity.value = withTiming(isOpen ? 0 : 1, { duration: 200 });
  };

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const handleAction = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsOpen(false);
    rotation.value = withSpring(0, { damping: 12 });
    menuOpacity.value = withTiming(0, { duration: 200 });
    action();
  };

  return (
    <>
      {isOpen ? (
        <Pressable
          style={styles.overlay}
          onPress={() => {
            setIsOpen(false);
            rotation.value = withSpring(0, { damping: 12 });
            menuOpacity.value = withTiming(0, { duration: 200 });
          }}
        />
      ) : null}

      <View style={[styles.container, { bottom: fabBottom }]}>
        {isOpen ? (
          <Animated.View style={[styles.menu, animatedMenuStyle]}>
            <Pressable
              style={[styles.menuItem, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => handleAction(onAddExpense)}
            >
              <Feather name="edit-3" size={20} color={theme.primary} />
              <ThemedText type="body" style={styles.menuLabel}>
                Add Manually
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.menuItem, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => handleAction(onScanReceipt)}
            >
              <Feather name="camera" size={20} color={theme.accent} />
              <ThemedText type="body" style={styles.menuLabel}>
                Scan Receipt
              </ThemedText>
            </Pressable>
          </Animated.View>
        ) : null}

        <AnimatedPressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={[
            styles.fab,
            { backgroundColor: theme.primary },
            Shadows.floatingButton,
            animatedButtonStyle,
          ]}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </AnimatedPressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  container: {
    position: "absolute",
    right: Spacing.lg,
    alignItems: "flex-end",
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    ...Shadows.card,
  },
  menuLabel: {
    marginLeft: Spacing.md,
  },
});
