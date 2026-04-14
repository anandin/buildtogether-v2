import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface Props {
  emoji: string;
  name: string;
  savedAmount: number;
  targetAmount: number;
  color: string;
  onPress?: () => void;
}

/**
 * 160x120 card for the horizontal cards rail on Home.
 * Shows dream emoji, name, saved/target, progress bar. Replaces the big
 * "Dreams Protected" donut circle that dominated V1's home screen.
 */
export function CompactDreamCard({
  emoji,
  name,
  savedAmount,
  targetAmount,
  color,
  onPress,
}: Props) {
  const { theme } = useTheme();
  const pct = Math.min(Math.round((savedAmount / targetAmount) * 100), 100);

  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.backgroundDefault,
          borderColor: color + "30",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <ThemedText style={styles.emoji}>{emoji}</ThemedText>
        <ThemedText type="tiny" style={[styles.pct, { color }]}>
          {pct}%
        </ThemedText>
      </View>

      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ color: theme.text, fontWeight: "600" }}
      >
        {name}
      </ThemedText>

      <View style={[styles.track, { backgroundColor: theme.backgroundSecondary }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: color, width: `${pct}%` },
          ]}
        />
      </View>

      <ThemedText type="tiny" style={{ color: theme.textTertiary }}>
        ${savedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ${targetAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 160,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
  },
  pct: {
    fontWeight: "700",
    fontSize: 12,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
