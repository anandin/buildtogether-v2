import React, { useEffect } from "react";
import { View, StyleSheet, Image } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

/**
 * Shimmer placeholder for the Guardian greeting. Shown before the greeting
 * API responds so the chat area never appears empty on first load.
 */
export function GuardianGreetingSkeleton() {
  const { theme } = useTheme();
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }));

  return (
    <View style={styles.row}>
      <Image source={dreamGuardianIcon} style={styles.avatar} />
      <View style={[styles.bubble, { backgroundColor: theme.aiLight, borderColor: theme.aiPrimary + "30" }]}>
        <Animated.View style={[styles.lineLong, { backgroundColor: theme.textTertiary }, shimmerStyle]} />
        <Animated.View style={[styles.lineShort, { backgroundColor: theme.textTertiary }, shimmerStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 2,
  },
  bubble: {
    flex: 1,
    maxWidth: "85%",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  lineLong: {
    height: 10,
    borderRadius: 5,
    width: "80%",
    opacity: 0.3,
  },
  lineShort: {
    height: 10,
    borderRadius: 5,
    width: "55%",
    opacity: 0.3,
  },
});
