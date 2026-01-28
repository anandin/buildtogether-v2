import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { AIInsight } from "@/types";

interface AICoachProps {
  onViewDetails?: (insight: AIInsight) => void;
}

export function AICoach({ onViewDetails }: AICoachProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const { data, addAIInsight, dismissInsight } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeInsights = data?.aiInsights?.filter(i => !i.isDismissed) || [];
  const shouldFetchInsights = activeInsights.length === 0 || shouldRefreshInsights();

  function shouldRefreshInsights(): boolean {
    if (!data?.lastInsightCheck) return true;
    const lastCheck = new Date(data.lastInsightCheck);
    const now = new Date();
    const hoursSinceCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
    return hoursSinceCheck >= 24;
  }

  const fetchInsights = async () => {
    if (!data || loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const apiUrl = getApiUrl();
      const response = await fetch(new URL("/api/ai-insights", apiUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: data.expenses,
          goals: data.goals,
          categoryBudgets: data.categoryBudgets,
          partners: data.partners,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.insights && Array.isArray(result.insights)) {
          for (const insight of result.insights) {
            await addAIInsight(insight);
          }
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError("Couldn't get insights right now");
      }
    } catch (err) {
      console.error("Error fetching insights:", err);
      setError("Couldn't get insights right now");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (id: string) => {
    await dismissInsight(id);
    Haptics.selectionAsync();
  };

  const handleAction = (insight: AIInsight) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (insight.actionType === "add_to_goal") {
      const firstGoal = data?.goals?.[0];
      if (firstGoal) {
        navigation.navigate("DreamDetail", { 
          goalId: firstGoal.id,
          suggestedAmount: insight.amount || 0,
          fromCoach: true 
        });
      } else {
        navigation.navigate("Dreams");
      }
    } else if (insight.actionType === "view_category" && insight.category) {
      navigation.navigate("Expenses");
    } else if (onViewDetails) {
      onViewDetails(insight);
    }
  };

  const getInsightIcon = (type: AIInsight["type"]): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "saving_tip": return "trending-down";
      case "spending_alert": return "alert-triangle";
      case "goal_nudge": return "target";
      case "trend_analysis": return "bar-chart-2";
      default: return "message-circle";
    }
  };

  const getInsightColor = (type: AIInsight["type"], priority: AIInsight["priority"]): string => {
    if (priority === "high") return theme.error;
    switch (type) {
      case "saving_tip": return theme.success;
      case "spending_alert": return theme.warning;
      case "goal_nudge": return theme.primary;
      case "trend_analysis": return theme.accent;
      default: return theme.primary;
    }
  };

  if (activeInsights.length === 0 && !loading) {
    return (
      <Pressable onPress={fetchInsights}>
        <Card style={StyleSheet.flatten([styles.emptyCard, { borderColor: theme.primary + "30" }])}>
          <View style={[styles.aiIconContainer, { backgroundColor: theme.primary + "15" }]}>
            <Feather name="cpu" size={24} color={theme.primary} />
          </View>
          <View style={styles.emptyContent}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>
              AI Savings Coach
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Tap to get personalized savings tips based on your spending
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Card>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <Card style={styles.loadingCard}>
        <ActivityIndicator size="small" color={theme.primary} />
        <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
          Analyzing your spending patterns...
        </ThemedText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="cpu" size={18} color={theme.primary} />
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            AI Insights
          </ThemedText>
        </View>
        <Pressable onPress={fetchInsights} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={16} color={theme.primary} />
        </Pressable>
      </View>

      {activeInsights.slice(0, 3).map((insight, index) => (
        <Animated.View
          key={insight.id}
          entering={FadeInDown.delay(index * 100)}
          exiting={FadeOutUp}
        >
          <Card style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <View style={[
                styles.insightIcon, 
                { backgroundColor: getInsightColor(insight.type, insight.priority) + "15" }
              ]}>
                <Feather 
                  name={getInsightIcon(insight.type)} 
                  size={16} 
                  color={getInsightColor(insight.type, insight.priority)} 
                />
              </View>
              <View style={styles.insightContent}>
                <ThemedText type="small" style={{ fontWeight: "600" }}>
                  {insight.title}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {insight.message}
                </ThemedText>
              </View>
              <Pressable 
                onPress={() => handleDismiss(insight.id)}
                style={styles.dismissButton}
                hitSlop={8}
              >
                <Feather name="x" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>

            {insight.actionText || insight.actionType === "add_to_goal" ? (
              <Pressable
                onPress={() => handleAction(insight)}
                style={[styles.actionButton, { backgroundColor: theme.primary + "10" }]}
              >
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>
                  {insight.actionText || (insight.amount ? `Move $${insight.amount} to Dream` : "Add to Dream")}
                </ThemedText>
                <Feather name="arrow-right" size={14} color={theme.primary} />
              </Pressable>
            ) : null}
          </Card>
        </Animated.View>
      ))}

      {error ? (
        <ThemedText type="tiny" style={{ color: theme.error, textAlign: "center" }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.xs,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  aiIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContent: {
    flex: 1,
    gap: 2,
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  insightCard: {
    gap: Spacing.sm,
  },
  insightHeader: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  insightIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  insightContent: {
    flex: 1,
    gap: 2,
  },
  dismissButton: {
    padding: Spacing.xs,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },
});
