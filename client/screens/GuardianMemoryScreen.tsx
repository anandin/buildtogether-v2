import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { PremiumGate } from "@/components/PremiumGate";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";

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

interface LearningEvent {
  id: string;
  createdAt: string;
  aiObservation: string;
  recommendedApproach: string;
  effectiveTechniques: string[] | null;
  ineffectiveTechniques: string[] | null;
  nudgesAnalyzed: number;
  scores: {
    lossAversion: number;
    gainFraming: number;
    progress: number;
    urgency: number;
  };
}

interface NudgeWithRationale {
  id: string;
  date: string;
  message: string;
  rationale: string | null;
  evidenceData: {
    triggerPattern?: string;
    dataPoints?: string[];
    comparisonContext?: string;
    confidenceLevel?: string;
  } | null;
  behavioralTechnique: string | null;
  userResponse: string | null;
}

interface NudgePreferences {
  lossAversionScore: number;
  gainFramingScore: number;
  progressScore: number;
  urgencyScore: number;
  totalNudgesReceived: number;
  nudgesActedOn: number;
  totalSavedFromNudges: number | null;
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
  learningHistory: LearningEvent[];
  recentNudgesWithRationale: NudgeWithRationale[];
  nudgePreferences: NudgePreferences | null;
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
    ignored: { label: "Ignored", color: theme.error, bg: theme.error + "20" },
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

function BehavioralScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const { theme } = useTheme();
  const percentage = Math.min(100, Math.max(0, score * 100));
  
  return (
    <View style={styles.scoreBarContainer}>
      <View style={styles.scoreBarHeader}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
          {Math.round(percentage)}%
        </ThemedText>
      </View>
      <View style={[styles.scoreBarBg, { backgroundColor: theme.border }]}>
        <View 
          style={[
            styles.scoreBarFill, 
            { width: `${percentage}%`, backgroundColor: color }
          ]} 
        />
      </View>
    </View>
  );
}

function TechniquePill({ technique, effective }: { technique: string; effective: boolean }) {
  const { theme } = useTheme();
  const color = effective ? theme.success : theme.error;
  
  return (
    <View style={[styles.techniquePill, { backgroundColor: color + "15", borderColor: color + "30" }]}>
      <Feather 
        name={effective ? "check" : "x"} 
        size={10} 
        color={color} 
      />
      <ThemedText type="tiny" style={{ color }}>
        {technique}
      </ThemedText>
    </View>
  );
}

export default function GuardianMemoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { isPremium } = useSubscription();
  const [expandedNudge, setExpandedNudge] = useState<string | null>(null);
  
  const { user } = useAuth();
  const coupleId = user?.coupleId;
  
  const { data, isLoading, error } = useQuery<GuardianMemoryData>({
    queryKey: ["/api/guardian/memory", coupleId],
    enabled: !!coupleId && isPremium,
  });

  if (!isPremium) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot, paddingTop: headerHeight }]}>
        <PremiumGate 
          feature="Guardian Memory"
          description="See exactly how Dream Guardian learns about you - every pattern it observes, every insight it gains, and every nudge it sends"
        >
          <View />
        </PremiumGate>
      </View>
    );
  }
  
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
      
      {data.nudgePreferences ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="user" size={20} color={theme.primary} />
            <ThemedText type="heading" style={styles.sectionTitle}>
              What AI Knows About You
            </ThemedText>
          </View>
          <ThemedText type="small" style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Behavioral profile learned from your responses to suggestions
          </ThemedText>
          
          <View style={styles.scoresList}>
            <BehavioralScoreBar 
              label="Loss Aversion" 
              score={data.nudgePreferences.lossAversionScore} 
              color="#EF4444"
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              You respond well when I mention what you might miss out on
            </ThemedText>
            
            <BehavioralScoreBar 
              label="Gain Framing" 
              score={data.nudgePreferences.gainFramingScore} 
              color="#10B981"
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              You respond well when I highlight potential rewards
            </ThemedText>
            
            <BehavioralScoreBar 
              label="Progress Motivation" 
              score={data.nudgePreferences.progressScore} 
              color={theme.primary}
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              You're motivated by seeing how far you've come
            </ThemedText>
            
            <BehavioralScoreBar 
              label="Urgency Response" 
              score={data.nudgePreferences.urgencyScore} 
              color="#F59E0B"
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Time-sensitive suggestions get your attention
            </ThemedText>
          </View>
          
          <View style={[styles.nudgeStats, { borderTopColor: theme.border }]}>
            <View style={styles.nudgeStatItem}>
              <ThemedText type="h3" style={{ color: theme.primary }}>
                {data.nudgePreferences.totalNudgesReceived}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Total nudges
              </ThemedText>
            </View>
            <View style={styles.nudgeStatItem}>
              <ThemedText type="h3" style={{ color: theme.success }}>
                {data.nudgePreferences.nudgesActedOn}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Acted on
              </ThemedText>
            </View>
            {data.nudgePreferences.totalSavedFromNudges ? (
              <View style={styles.nudgeStatItem}>
                <ThemedText type="h3" style={{ color: "#10B981" }}>
                  ${data.nudgePreferences.totalSavedFromNudges}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  Saved from nudges
                </ThemedText>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
      
      {data.learningHistory && data.learningHistory.length > 0 ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="trending-up" size={20} color="#10B981" />
            <ThemedText type="heading" style={styles.sectionTitle}>
              AI Learning History
            </ThemedText>
          </View>
          <ThemedText type="small" style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            How the AI has evolved its understanding of you over time
          </ThemedText>
          
          <View style={styles.learningList}>
            {data.learningHistory.map((event, index) => (
              <View 
                key={event.id}
                style={[
                  styles.learningEvent,
                  index < data.learningHistory.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }
                ]}
              >
                <View style={styles.learningHeader}>
                  <Feather name="activity" size={14} color={theme.accent} />
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    {format(new Date(event.createdAt), "MMM d, yyyy")} • Analyzed {event.nudgesAnalyzed} nudges
                  </ThemedText>
                </View>
                
                <ThemedText type="body" style={{ marginVertical: Spacing.sm }}>
                  {event.aiObservation}
                </ThemedText>
                
                <View style={[styles.approachBox, { backgroundColor: theme.primary + "10" }]}>
                  <Feather name="compass" size={14} color={theme.primary} />
                  <ThemedText type="small" style={{ flex: 1, color: theme.text }}>
                    {event.recommendedApproach}
                  </ThemedText>
                </View>
                
                {(event.effectiveTechniques?.length || event.ineffectiveTechniques?.length) ? (
                  <View style={styles.techniquesRow}>
                    {event.effectiveTechniques?.map((tech, i) => (
                      <TechniquePill key={`eff-${i}`} technique={tech} effective={true} />
                    ))}
                    {event.ineffectiveTechniques?.map((tech, i) => (
                      <TechniquePill key={`ineff-${i}`} technique={tech} effective={false} />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      
      {data.recentNudgesWithRationale && data.recentNudgesWithRationale.length > 0 ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="message-circle" size={20} color={theme.accent} />
            <ThemedText type="heading" style={styles.sectionTitle}>
              Recent Nudges (Full Transparency)
            </ThemedText>
          </View>
          <ThemedText type="small" style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Tap any nudge to see exactly why I suggested it
          </ThemedText>
          
          <View style={styles.nudgesList}>
            {data.recentNudgesWithRationale.map((nudge, index) => (
              <Pressable
                key={nudge.id}
                onPress={() => setExpandedNudge(expandedNudge === nudge.id ? null : nudge.id)}
                style={[
                  styles.nudgeItem,
                  index < data.recentNudgesWithRationale.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }
                ]}
              >
                <View style={styles.nudgeHeader}>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    {format(new Date(nudge.date), "MMM d")}
                  </ThemedText>
                  {nudge.userResponse ? (
                    <StatusBadge status={nudge.userResponse} />
                  ) : null}
                </View>
                
                <ThemedText type="body" style={{ marginVertical: Spacing.sm }}>
                  {nudge.message}
                </ThemedText>
                
                {nudge.behavioralTechnique ? (
                  <View style={[styles.techBadge, { backgroundColor: theme.accent + "15" }]}>
                    <Feather name="zap" size={10} color={theme.accent} />
                    <ThemedText type="tiny" style={{ color: theme.accent }}>
                      {nudge.behavioralTechnique.replace(/_/g, " ")}
                    </ThemedText>
                  </View>
                ) : null}
                
                {expandedNudge === nudge.id ? (
                  <View style={[styles.rationaleExpanded, { backgroundColor: theme.backgroundSecondary }]}>
                    {nudge.rationale ? (
                      <View style={styles.rationaleSection}>
                        <ThemedText type="tiny" style={{ color: theme.primary, fontWeight: "600", marginBottom: Spacing.xs }}>
                          Why I suggested this:
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.text }}>
                          {nudge.rationale}
                        </ThemedText>
                      </View>
                    ) : null}
                    
                    {nudge.evidenceData ? (
                      <View style={styles.evidenceSection}>
                        <ThemedText type="tiny" style={{ color: theme.success, fontWeight: "600", marginBottom: Spacing.xs }}>
                          Evidence I used:
                        </ThemedText>
                        
                        {nudge.evidenceData.triggerPattern ? (
                          <View style={styles.evidenceRow}>
                            <Feather name="target" size={12} color={theme.textSecondary} />
                            <ThemedText type="tiny" style={{ color: theme.textSecondary, flex: 1 }}>
                              Trigger: {nudge.evidenceData.triggerPattern}
                            </ThemedText>
                          </View>
                        ) : null}
                        
                        {nudge.evidenceData.dataPoints?.map((point, i) => (
                          <View key={i} style={styles.evidenceRow}>
                            <Feather name="check" size={12} color={theme.textSecondary} />
                            <ThemedText type="tiny" style={{ color: theme.textSecondary, flex: 1 }}>
                              {point}
                            </ThemedText>
                          </View>
                        ))}
                        
                        {nudge.evidenceData.confidenceLevel ? (
                          <View style={styles.evidenceRow}>
                            <Feather name="bar-chart-2" size={12} color={theme.textSecondary} />
                            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                              Confidence: {nudge.evidenceData.confidenceLevel}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.expandHint}>
                    <Feather name="chevron-down" size={14} color={theme.textSecondary} />
                    <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                      Tap to see rationale
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
      
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
  scoresList: {
    marginTop: Spacing.sm,
  },
  scoreBarContainer: {
    marginBottom: Spacing.xs,
  },
  scoreBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  scoreBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  nudgeStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  nudgeStatItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  learningList: {
    marginTop: Spacing.sm,
  },
  learningEvent: {
    paddingVertical: Spacing.md,
  },
  learningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  approachBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  techniquesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  techniquePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  nudgesList: {
    marginTop: Spacing.sm,
  },
  nudgeItem: {
    paddingVertical: Spacing.md,
  },
  nudgeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  techBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  expandHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  rationaleExpanded: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  rationaleSection: {
    marginBottom: Spacing.sm,
  },
  evidenceSection: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
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
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
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
