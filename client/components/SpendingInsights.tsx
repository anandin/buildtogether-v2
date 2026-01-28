import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "./ThemedText";
import { Card } from "./Card";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

const COUPLE_ID_KEY = "@couple_id";

interface Insight {
  type: "celebration" | "observation" | "suggestion";
  category: string;
  title: string;
  message: string;
  benchmarkComparison: "below" | "average" | "above" | null;
  potentialSavings: number | null;
}

interface SpendingInsightsData {
  overallHealthScore: number;
  insights: Insight[];
  spendingBreakdown: {
    essential: number;
    discretionary: number;
    treats: number;
  };
  monthlyProjected?: number;
  dayOfMonth?: number;
  daysInMonth?: number;
  cached?: boolean;
}

const INSIGHT_TYPE_COLORS: Record<string, string> = {
  celebration: "#10B981",
  observation: "#6366F1",
  suggestion: "#F59E0B",
};

const INSIGHT_TYPE_ICONS: Record<string, string> = {
  celebration: "award",
  observation: "eye",
  suggestion: "lightbulb",
};

export function SpendingInsights() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<SpendingInsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchInsights = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
      if (coupleId) {
        const response = await apiRequest("POST", `/api/spending-insights/${coupleId}`, { forceRefresh });
        const data = await response.json();
        setInsights(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      setError("Could not generate insights");
      console.error("Insights error:", err);
    } finally {
      setLoading(false);
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "#10B981";
    if (score >= 60) return "#6366F1";
    if (score >= 40) return "#F59E0B";
    return "#EF4444";
  };

  const getBenchmarkLabel = (comparison: string | null) => {
    switch (comparison) {
      case "below": return "Below Average";
      case "average": return "On Track";
      case "above": return "Above Average";
      default: return "";
    }
  };

  const getBenchmarkColor = (comparison: string | null) => {
    switch (comparison) {
      case "below": return "#10B981";
      case "average": return "#6366F1";
      case "above": return "#F59E0B";
      default: return theme.textSecondary;
    }
  };

  if (!insights && !loading && !error) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + "15" }]}>
            <Image 
              source={dreamGuardianIcon} 
              style={styles.guardianImage} 
              resizeMode="cover"
            />
          </View>
          <View style={styles.headerText}>
            <ThemedText type="heading">Dream Guardian Insights</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Personalized tips based on your spending
            </ThemedText>
          </View>
        </View>
        
        <Pressable
          style={[styles.generateButton, { backgroundColor: theme.primary }]}
          onPress={() => fetchInsights()}
        >
          <Feather name="zap" size={18} color="#FFFFFF" />
          <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
            Get Insights
          </ThemedText>
        </Pressable>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card style={styles.card}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="body" style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
            Dream Guardian is analyzing your spending...
          </ThemedText>
        </View>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.card}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={32} color={theme.error} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            {error}
          </ThemedText>
          <Pressable
            style={[styles.retryButton, { borderColor: theme.border }]}
            onPress={() => fetchInsights()}
          >
            <ThemedText type="small">Try Again</ThemedText>
          </Pressable>
        </View>
      </Card>
    );
  }

  if (!insights) return null;

  const visibleInsights = expanded ? insights.insights : insights.insights.slice(0, 3);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.scoreContainer}>
          <View 
            style={[
              styles.scoreCircle, 
              { borderColor: getHealthScoreColor(insights.overallHealthScore) }
            ]}
          >
            <ThemedText type="h3" style={{ color: getHealthScoreColor(insights.overallHealthScore) }}>
              {insights.overallHealthScore}
            </ThemedText>
          </View>
          <View style={styles.scoreLabel}>
            <ThemedText type="heading">Financial Health</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Compared to similar families
            </ThemedText>
          </View>
        </View>
        <Pressable onPress={() => fetchInsights(true)} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      {insights.monthlyProjected && insights.dayOfMonth && insights.daysInMonth ? (
        <View style={[styles.projectionBanner, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="trending-up" size={14} color={theme.textSecondary} />
          <ThemedText type="tiny" style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}>
            Day {insights.dayOfMonth} of {insights.daysInMonth} | Projected: ${Math.round(insights.monthlyProjected)}/mo
          </ThemedText>
          {insights.cached ? (
            <View style={[styles.cachedBadge, { backgroundColor: theme.success + "20" }]}>
              <ThemedText type="tiny" style={{ color: theme.success }}>Cached</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>Essential</ThemedText>
          <ThemedText type="body" style={{ fontWeight: "600", color: "#10B981" }}>
            {insights.spendingBreakdown.essential}%
          </ThemedText>
        </View>
        <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />
        <View style={styles.breakdownItem}>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>Discretionary</ThemedText>
          <ThemedText type="body" style={{ fontWeight: "600", color: "#6366F1" }}>
            {insights.spendingBreakdown.discretionary}%
          </ThemedText>
        </View>
        <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />
        <View style={styles.breakdownItem}>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>Treats</ThemedText>
          <ThemedText type="body" style={{ fontWeight: "600", color: "#F59E0B" }}>
            {insights.spendingBreakdown.treats}%
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <ThemedText type="body" style={{ fontWeight: "600", marginBottom: Spacing.md }}>
        Personalized Insights
      </ThemedText>

      {visibleInsights.map((insight, index) => (
        <View 
          key={index} 
          style={[
            styles.insightCard, 
            { backgroundColor: INSIGHT_TYPE_COLORS[insight.type] + "10" }
          ]}
        >
          <View style={styles.insightHeader}>
            <View 
              style={[
                styles.insightIcon, 
                { backgroundColor: INSIGHT_TYPE_COLORS[insight.type] + "20" }
              ]}
            >
              <Feather 
                name={INSIGHT_TYPE_ICONS[insight.type] as any} 
                size={16} 
                color={INSIGHT_TYPE_COLORS[insight.type]} 
              />
            </View>
            <View style={styles.insightTitleRow}>
              <ThemedText type="body" style={{ fontWeight: "600", flex: 1 }}>
                {insight.title}
              </ThemedText>
              {insight.benchmarkComparison ? (
                <View 
                  style={[
                    styles.benchmarkBadge, 
                    { backgroundColor: getBenchmarkColor(insight.benchmarkComparison) + "20" }
                  ]}
                >
                  <ThemedText 
                    type="tiny" 
                    style={{ color: getBenchmarkColor(insight.benchmarkComparison) }}
                  >
                    {getBenchmarkLabel(insight.benchmarkComparison)}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
            {insight.message}
          </ThemedText>
          {insight.potentialSavings ? (
            <ThemedText type="tiny" style={{ color: "#10B981", marginTop: Spacing.xs }}>
              Potential savings: ${insight.potentialSavings}/month
            </ThemedText>
          ) : null}
        </View>
      ))}

      {insights.insights.length > 3 ? (
        <Pressable
          style={styles.showMoreButton}
          onPress={() => setExpanded(!expanded)}
        >
          <ThemedText type="small" style={{ color: "#6366F1" }}>
            {expanded ? "Show Less" : `Show ${insights.insights.length - 3} More`}
          </ThemedText>
          <Feather 
            name={expanded ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#6366F1" 
          />
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  guardianImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  headerText: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 2,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  loadingContainer: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  errorContainer: {
    alignItems: "center",
    padding: Spacing.lg,
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreLabel: {
    gap: 2,
  },
  refreshButton: {
    padding: Spacing.sm,
  },
  projectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  cachedBadge: {
    marginLeft: "auto",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: Spacing.lg,
  },
  breakdownItem: {
    alignItems: "center",
    gap: 2,
  },
  breakdownDivider: {
    width: 1,
    height: 30,
  },
  divider: {
    height: 1,
    marginBottom: Spacing.lg,
  },
  insightCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  insightIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: Spacing.sm,
    gap: Spacing.sm,
  },
  benchmarkBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
});
