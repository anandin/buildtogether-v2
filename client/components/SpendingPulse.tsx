import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";

interface Props {
  expenses: Expense[];
  days?: number;
}

/**
 * Compact 7-day spending bar strip for the Activity tab header.
 * Each bar = one day's total. Today is highlighted. Gives instant "pulse"
 * of recent spending without taking much vertical space.
 */
export function SpendingPulse({ expenses, days = 7 }: Props) {
  const { theme } = useTheme();

  const bars = useMemo(() => {
    const result: Array<{ day: string; total: number; isToday: boolean }> = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const total = expenses
        .filter(e => e.date === key)
        .reduce((s, e) => s + e.amount, 0);
      result.push({
        day: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        total,
        isToday: i === 0,
      });
    }
    return result;
  }, [expenses, days]);

  const maxTotal = Math.max(...bars.map(b => b.total), 1);
  const weekTotal = bars.reduce((s, b) => s + b.total, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.header}>
        <View>
          <ThemedText type="tiny" style={{ color: theme.textSecondary, fontSize: 11 }}>
            Last 7 days
          </ThemedText>
          <ThemedText type="h4" style={{ color: theme.text }}>
            ${weekTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </ThemedText>
        </View>
      </View>

      <View style={styles.bars}>
        {bars.map((b, idx) => {
          const h = Math.max((b.total / maxTotal) * 48, 4);
          const color = b.isToday ? theme.primary : theme.primary + "60";
          return (
            <View key={idx} style={styles.barCol}>
              <View style={[styles.bar, { height: h, backgroundColor: color }]} />
              <ThemedText type="tiny" style={{ color: theme.textTertiary, fontSize: 10 }}>
                {b.day}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 64,
    gap: Spacing.xs,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  bar: {
    width: "70%",
    maxWidth: 28,
    borderRadius: 3,
    minHeight: 4,
  },
});
