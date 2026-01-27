import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function GoalDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { data, addGoalContribution, deleteGoal } = useApp();

  const goalId = route.params?.goalId;
  const goal = data?.goals.find((g) => g.id === goalId);

  const [contributionAmount, setContributionAmount] = useState("");
  const [contributor, setContributor] = useState<"partner1" | "partner2">("partner1");
  const [adding, setAdding] = useState(false);

  if (!goal) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ThemedText type="body">Goal not found</ThemedText>
      </View>
    );
  }

  const progress = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
  const percentage = Math.min(Math.round(progress * 100), 100);
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);

  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  const handleAddContribution = async () => {
    const amount = parseFloat(contributionAmount);
    if (isNaN(amount) || amount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setAdding(true);
    try {
      await addGoalContribution(goal.id, amount, contributor);
      setContributionAmount("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    await deleteGoal(goal.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: goal.color + "20" }]}>
          <Feather name={goal.emoji as any} size={32} color={goal.color} />
        </View>
        <ThemedText type="h3">{goal.name}</ThemedText>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressRing}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.border}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={goal.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={styles.progressCenter}>
            <ThemedText type="h2" style={{ color: goal.color }}>
              {percentage}%
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              complete
            </ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Saved
            </ThemedText>
            <ThemedText type="h4" style={{ color: goal.color }}>
              ${goal.savedAmount.toLocaleString()}
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.stat}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Remaining
            </ThemedText>
            <ThemedText type="h4">${remaining.toLocaleString()}</ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.stat}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Target
            </ThemedText>
            <ThemedText type="h4">${goal.targetAmount.toLocaleString()}</ThemedText>
          </View>
        </View>
      </View>

      <Card style={styles.addCard}>
        <ThemedText type="heading" style={styles.cardTitle}>
          Add Funds
        </ThemedText>
        <View style={[styles.amountInput, { backgroundColor: theme.backgroundSecondary }]}>
          <ThemedText type="h4" style={{ color: theme.textSecondary }}>$</ThemedText>
          <TextInput
            style={[styles.amountInputField, { color: theme.text }]}
            value={contributionAmount}
            onChangeText={setContributionAmount}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.contributorRow}>
          {(["partner1", "partner2"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                setContributor(p);
                Haptics.selectionAsync();
              }}
              style={[
                styles.contributorButton,
                {
                  backgroundColor:
                    contributor === p ? goal.color + "20" : theme.backgroundSecondary,
                  borderColor: contributor === p ? goal.color : "transparent",
                },
              ]}
            >
              <ThemedText
                type="body"
                style={{ color: contributor === p ? goal.color : theme.text }}
              >
                {data?.partners[p]?.name || p}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <Button
          onPress={handleAddContribution}
          disabled={adding || !contributionAmount}
          style={[styles.addButton, { backgroundColor: goal.color }]}
        >
          {adding ? "Adding..." : "Add to Goal"}
        </Button>
      </Card>

      {goal.contributions.length > 0 ? (
        <View style={styles.historySection}>
          <ThemedText type="heading" style={styles.sectionTitle}>
            Contribution History
          </ThemedText>
          {goal.contributions
            .slice()
            .reverse()
            .map((contribution) => (
              <View
                key={contribution.id}
                style={[styles.historyItem, { backgroundColor: theme.backgroundDefault }]}
              >
                <View>
                  <ThemedText type="body" style={{ color: goal.color }}>
                    +${contribution.amount.toLocaleString()}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {data?.partners[contribution.contributor]?.name} •{" "}
                    {format(new Date(contribution.date), "MMM d, yyyy")}
                  </ThemedText>
                </View>
                <Feather name="check-circle" size={20} color={theme.success} />
              </View>
            ))}
        </View>
      ) : null}

      <Pressable onPress={handleDelete} style={styles.deleteButton}>
        <Feather name="trash-2" size={18} color={theme.error} />
        <ThemedText type="body" style={{ color: theme.error, marginLeft: Spacing.sm }}>
          Delete Goal
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  progressSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  progressRing: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  progressCenter: {
    position: "absolute",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  addCard: {
    marginBottom: Spacing.xl,
  },
  cardTitle: {
    marginBottom: Spacing.lg,
  },
  amountInput: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  amountInputField: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  contributorRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  contributorButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  addButton: {},
  historySection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
  },
});
