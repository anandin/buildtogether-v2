import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface Props {
  label: string;
  spent: number;
  limit: number;
  icon?: string;
  onPress?: () => void;
}

/**
 * 160x120 card for the cards rail. Shows a budget category's spent/limit ratio
 * with a small progress bar. Friendlier companion to CompactDreamCard.
 */
export function CompactBudgetCard({
  label,
  spent,
  limit,
  icon = "pie-chart",
  onPress,
}: Props) {
  const { theme } = useTheme();
  const pct = Math.min((spent / limit) * 100, 100);

  const statusColor =
    pct >= 100 ? theme.error :
    pct >= 80 ? theme.warning :
    theme.success;

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
          borderColor: statusColor + "30",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: statusColor + "15" }]}>
          <Feather name={icon as any} size={14} color={statusColor} />
        </View>
        <ThemedText type="tiny" style={[styles.pct, { color: statusColor }]}>
          {Math.round(pct)}%
        </ThemedText>
      </View>

      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ color: theme.text, fontWeight: "600" }}
      >
        {label}
      </ThemedText>

      <View style={[styles.track, { backgroundColor: theme.backgroundSecondary }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: statusColor, width: `${pct}%` },
          ]}
        />
      </View>

      <ThemedText type="tiny" style={{ color: theme.textTertiary }}>
        ${spent.toFixed(0)} of ${limit.toFixed(0)}
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
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
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
