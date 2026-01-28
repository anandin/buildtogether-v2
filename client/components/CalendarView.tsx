import React, { useMemo } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Expense } from "@/types";
import { getDailyTotals } from "@/lib/cloudStorage";

interface CalendarViewProps {
  expenses: Expense[];
  currentDate: Date;
  onMonthChange: (date: Date) => void;
  onDayPress?: (date: Date) => void;
  selectedDate?: Date;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarView({
  expenses,
  currentDate,
  onMonthChange,
  onDayPress,
  selectedDate,
}: CalendarViewProps) {
  const { theme } = useTheme();

  const dailyTotals = useMemo(() => {
    return getDailyTotals(
      expenses,
      currentDate.getFullYear(),
      currentDate.getMonth()
    );
  }, [expenses, currentDate]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });

    const startDayOfWeek = getDay(start);
    const adjustedStart = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const paddedDays: (Date | null)[] = Array(adjustedStart).fill(null);
    return [...paddedDays, ...days];
  }, [currentDate]);

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onMonthChange(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onMonthChange(newDate);
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1000) {
      return `-$${(amount / 1000).toFixed(1)}k`;
    }
    return `-$${amount.toFixed(0)}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.header}>
        <Pressable onPress={handlePrevMonth} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={theme.text} />
        </Pressable>
        <ThemedText type="heading">
          {format(currentDate, "MMM yyyy")}
        </ThemedText>
        <Pressable onPress={handleNextMonth} hitSlop={8}>
          <Feather name="chevron-right" size={24} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayCell}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              {day}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {calendarDays.map((day, index) => {
          if (!day) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          const dayNumber = day.getDate();
          const total = dailyTotals[dayNumber] || 0;
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <Pressable
              key={day.toISOString()}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: theme.primary + "20" },
              ]}
              onPress={() => onDayPress?.(day)}
            >
              <ThemedText
                type="small"
                style={[
                  styles.dayNumber,
                  isToday && { color: theme.primary, fontWeight: "700" },
                ]}
              >
                {dayNumber}
              </ThemedText>
              {total > 0 ? (
                <ThemedText
                  type="tiny"
                  style={[styles.dayAmount, { color: theme.error }]}
                >
                  {formatAmount(total)}
                </ThemedText>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  weekdaysRow: {
    flexDirection: "row",
    marginBottom: Spacing.xs,
  },
  weekdayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  dayNumber: {
    marginBottom: 1,
  },
  dayAmount: {
    fontSize: 9,
  },
});
