import React from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

const COUPLE_ID_KEY = "@build_together_couple_id";

interface GuardianInsight {
  id: string;
  insightType: string;
  category: string | null;
  trigger: string | null;
  observation: string;
  createdAt: string;
}

interface GuardianRecommendation {
  id: string;
  recommendationType: string;
  message: string;
  rationale: string | null;
  status: string;
  suggestedAmount: number | null;
  createdAt: string;
}

interface GuardianMemoryData {
  insights: GuardianInsight[];
  recentRecommendations: GuardianRecommendation[];
  streak: {
    currentStreak: number;
    longestStreak: number;
  } | null;
  effectivenessRate: number;
  familyProfile: {
    numAdults: number;
    numKidsUnder5: number;
    numKids5to12: number;
    numTeens: number;
    city: string | null;
    country: string;
    partner1Name: string | null;
    partner2Name: string | null;
  } | null;
  totalExpenses: number;
  recentExpenseCount: number;
}

function InsightTypeIcon({ type }: { type: string }) {
  const { theme } = useTheme();
  const iconMap: { [key: string]: { name: string; color: string } } = {
    spending_pattern: { name: "trending-up", color: theme.primary },
    category_preference: { name: "grid", color: theme.accent },
    time_pattern: { name: "clock", color: theme.warning },
    merchant_preference: { name: "shopping-bag", color: theme.success },
    savings_behavior: { name: "target", color: "#10B981" },
    default: { name: "zap", color: theme.textSecondary },
  };
  
  const icon = iconMap[type] || iconMap.default;
  return <Feather name={icon.name as any} size={16} color={icon.color} />;
}

function StatusBadge({ status }: { status: string }) {
  const { theme } = useTheme();
  
  const statusConfig: { [key: string]: { label: string; color: string; bg: string } } = {
    acted: { label: "Acted on", color: theme.success, bg: theme.success + "20" },
    dismissed: { label: "Dismissed", color: theme.textSecondary, bg: theme.textSecondary + "20" },
    pending: { label: "Pending", color: theme.warning, bg: theme.warning + "20" },
    shown: { label: "Shown", color: theme.accent, bg: theme.accent + "20" },
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  
  return (
    <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
      <ThemedText type="tiny" style={{ color: config.color, fontWeight: "600" }}>
        {config.label}
      </ThemedText>
    </View>
  );
}

export default function GuardianMemoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  
  const [coupleId, setCoupleId] = React.useState<string | null>(null);
  
  React.useEffect(() => {
    AsyncStorage.getItem(COUPLE_ID_KEY).then(id => {
      if (id) setCoupleId(id);
    });
  }, []);
  
  const { data, isLoading, error } = useQuery<GuardianMemoryData>({
    queryKey: ["/api/guardian/memory", coupleId],
    enabled: !!coupleId,
  });
  
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText type="body" style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
          Loading AI memory...
        </ThemedText>
      </View>
    );
  }
  
  if (error || !data) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={48} color={theme.textSecondary} />
        <ThemedText type="body" style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
          Unable to load AI memory
        </ThemedText>
      </View>
    );
  }
  
  const effectivenessPercent = Math.round(data.effectivenessRate * 100);
  
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.introSection}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="cpu" size={24} color={theme.primary} />
        </View>
        <ThemedText type="h2" style={styles.title}>Guardian Memory</ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Everything your AI companion has learned about your financial habits. 
          Full transparency - no hidden data.
        </ThemedText>
      </View>
      
      <Card style={styles.statsCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>How AI Is Helping</ThemedText>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <ThemedText type="h1" style={{ color: theme.success }}>
              {effectivenessPercent}%
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Suggestions acted on
            </ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="h1" style={{ color: theme.primary }}>
              {data.insights.length}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Patterns learned
            </ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="h1" style={{ color: theme.accent }}>
              {data.totalExpenses}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Expenses analyzed
            </ThemedText>
          </View>
        </View>
        
        {data.streak ? (
          <View style={[styles.streakSection, { borderTopColor: theme.border }]}>
            <View style={styles.streakItem}>
              <Feather name="zap" size={18} color="#F59E0B" />
              <ThemedText type="body">
                <ThemedText type="body" style={{ fontWeight: "700" }}>
                  {data.streak.currentStreak} week
                </ThemedText>
                {" "}current streak
              </ThemedText>
            </View>
            <View style={styles.streakItem}>
              <Feather name="award" size={18} color={theme.primary} />
              <ThemedText type="body">
                <ThemedText type="body" style={{ fontWeight: "700" }}>
                  {data.streak.longestStreak} weeks
                </ThemedText>
                {" "}best streak
              </ThemedText>
            </View>
          </View>
        ) : null}
      </Card>
      
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="eye" size={20} color={theme.primary} />
          <ThemedText type="heading" style={styles.sectionTitle}>
            What I've Learned
          </ThemedText>
        </View>
        <ThemedText type="small" style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
          Patterns detected from your spending and saving habits
        </ThemedText>
        
        {data.insights.length > 0 ? (
          <View style={styles.insightsList}>
            {data.insights.map((insight, index) => (
              <View 
                key={insight.id} 
                style={[
                  styles.insightItem, 
                  index < data.insights.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }
                ]}
              >
                <View style={styles.insightHeader}>
                  <InsightTypeIcon type={insight.insightType} />
                  <ThemedText type="small" style={{ color: theme.textSecondary, textTransform: "capitalize" }}>
                    {insight.insightType.replace(/_/g, " ")}
                  </ThemedText>
                  {insight.category ? (
                    <View style={[styles.categoryTag, { backgroundColor: theme.accent + "15" }]}>
                      <ThemedText type="tiny" style={{ color: theme.accent }}>
                        {insight.category}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <ThemedText type="body" style={styles.insightText}>
                  {insight.observation}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                  Learned {format(new Date(insight.createdAt), "MMM d, yyyy")}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="search" size={32} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              Still learning your patterns. Keep tracking!
            </ThemedText>
          </View>
        )}
      </Card>
      
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="message-circle" size={20} color={theme.accent} />
          <ThemedText type="heading" style={styles.sectionTitle}>
            Recent Suggestions
          </ThemedText>
        </View>
        <ThemedText type="small" style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
          Why I suggested what I did (transparency audit)
        </ThemedText>
        
        {data.recentRecommendations.length > 0 ? (
          <View style={styles.recommendationsList}>
            {data.recentRecommendations.map((rec, index) => (
              <View 
                key={rec.id} 
                style={[
                  styles.recommendationItem,
                  index < data.recentRecommendations.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }
                ]}
              >
                <View style={styles.recommendationHeader}>
                  <ThemedText type="small" style={{ flex: 1 }}>
                    {rec.message}
                  </ThemedText>
                  <StatusBadge status={rec.status} />
                </View>
                
                {rec.rationale ? (
                  <View style={[styles.rationaleBox, { backgroundColor: theme.backgroundSecondary }]}>
                    <Feather name="info" size={14} color={theme.textSecondary} />
                    <ThemedText type="tiny" style={{ color: theme.textSecondary, flex: 1 }}>
                      Why: {rec.rationale}
                    </ThemedText>
                  </View>
                ) : null}
                
                <View style={styles.recommendationFooter}>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    {format(new Date(rec.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </ThemedText>
                  {rec.suggestedAmount ? (
                    <ThemedText type="tiny" style={{ color: theme.success, fontWeight: "600" }}>
                      ${rec.suggestedAmount}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={32} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              No suggestions yet. Keep using the app!
            </ThemedText>
          </View>
        )}
      </Card>
      
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="shield" size={20} color={theme.success} />
          <ThemedText type="heading" style={styles.sectionTitle}>
            Your Privacy
          </ThemedText>
        </View>
        
        <View style={styles.privacyList}>
          <View style={styles.privacyItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText type="small">All data stays on your account</ThemedText>
          </View>
          <View style={styles.privacyItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText type="small">Never sold to third parties</ThemedText>
          </View>
          <View style={styles.privacyItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText type="small">AI learns only from your patterns</ThemedText>
          </View>
          <View style={styles.privacyItem}>
            <Feather name="check-circle" size={16} color={theme.success} />
            <ThemedText type="small">No bank account connections</ThemedText>
          </View>
        </View>
        
        <Pressable 
          style={[styles.privacyLink, { borderTopColor: theme.border }]}
          onPress={() => navigation.navigate("PrivacyPolicy" as never)}
        >
          <ThemedText type="small" style={{ color: theme.primary }}>
            Read full Privacy Policy
          </ThemedText>
          <Feather name="chevron-right" size={16} color={theme.primary} />
        </Pressable>
      </Card>
      
      {data.familyProfile ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="users" size={20} color={theme.primary} />
            <ThemedText type="heading" style={styles.sectionTitle}>
              What I Know About Your Household
            </ThemedText>
          </View>
          
          <View style={styles.profileDetails}>
            <View style={styles.profileRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Partners</ThemedText>
              <ThemedText type="body">
                {data.familyProfile.partner1Name || "Partner 1"} & {data.familyProfile.partner2Name || "Partner 2"}
              </ThemedText>
            </View>
            <View style={styles.profileRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>Adults</ThemedText>
              <ThemedText type="body">{data.familyProfile.numAdults}</ThemedText>
            </View>
            {(data.familyProfile.numKidsUnder5 > 0 || data.familyProfile.numKids5to12 > 0 || data.familyProfile.numTeens > 0) ? (
              <View style={styles.profileRow}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>Children</ThemedText>
                <ThemedText type="body">
                  {data.familyProfile.numKidsUnder5 + data.familyProfile.numKids5to12 + data.familyProfile.numTeens}
                </ThemedText>
              </View>
            ) : null}
            {data.familyProfile.city ? (
              <View style={styles.profileRow}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>Location</ThemedText>
                <ThemedText type="body">{data.familyProfile.city}, {data.familyProfile.country}</ThemedText>
              </View>
            ) : null}
          </View>
          
          <Pressable 
            style={[styles.privacyLink, { borderTopColor: theme.border }]}
            onPress={() => navigation.navigate("FamilyProfile" as never)}
          >
            <ThemedText type="small" style={{ color: theme.primary }}>
              Edit household profile
            </ThemedText>
            <Feather name="chevron-right" size={16} color={theme.primary} />
          </Pressable>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  introSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: Spacing.lg,
  },
  statsCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    marginLeft: 0,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.md,
  },
  statItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  streakSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  streakItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  insightsList: {
    marginTop: Spacing.sm,
  },
  insightItem: {
    paddingVertical: Spacing.md,
  },
  insightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  insightText: {
    lineHeight: 22,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  recommendationsList: {
    marginTop: Spacing.sm,
  },
  recommendationItem: {
    paddingVertical: Spacing.md,
  },
  recommendationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  rationaleBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  recommendationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  privacyList: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  privacyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  privacyLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  profileDetails: {
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
