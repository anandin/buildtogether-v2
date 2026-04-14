import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, ScrollView, StyleSheet, RefreshControl, Pressable, Image, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { NudgeCard } from "@/components/NudgeCard";
import { ThemedText } from "@/components/ThemedText";
import { GuardianInput } from "@/components/GuardianInput";
import { GuardianMessageBubble } from "@/components/GuardianMessageBubble";
import { useTheme } from "@/hooks/useTheme";
import { useGuardianChat } from "@/hooks/useGuardianChat";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

interface Nudge {
  id: string;
  title: string;
  message: string;
  suggestedAction: string | null;
  targetAmount: number | null;
  category: string | null;
  rationale: string | null;
  behavioralTechnique: string | null;
  evidenceData?: {
    patternId?: string;
    merchant?: string;
    potentialSavings?: number;
  };
}

interface PersonalizedGreeting {
  greeting: string;
  message: string;
  suggestion: string;
  mood: "celebrate" | "encourage" | "gentle-nudge" | "welcome";
  context: {
    timeOfDay: string;
    currentStreak: number;
    totalSaved: number;
    goalsCount: number;
    closestGoalProgress: number | null;
  };
}

interface SavingsStreak {
  currentStreak: number;
  longestStreak: number;
  totalConfirmations: number;
  totalAmountSaved: number;
  lastConfirmationDate: string | null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ActionButton({ icon, label, subtitle, color, onPress, testID }: { 
  icon: string; label: string; subtitle: string; color: string; onPress: () => void; testID?: string 
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      style={[styles.actionButton, { backgroundColor: theme.backgroundDefault }, animatedStyle]}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + "12" }]}>
        <Feather name={icon as any} size={24} color={color} />
      </View>
      <View style={styles.actionText}>
        <ThemedText type="heading" style={{ fontSize: 16 }}>{label}</ThemedText>
        <ThemedText type="tiny" style={{ color: theme.textSecondary }}>{subtitle}</ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textTertiary} />
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const guardianChat = useGuardianChat();

  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loadingNudges, setLoadingNudges] = useState(false);

  const breatheScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);

  React.useEffect(() => {
    breatheScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breatheScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const totalSaved = useMemo(() => {
    if (!data?.goals) return 0;
    return data.goals.reduce((sum, g) => sum + g.savedAmount, 0);
  }, [data?.goals]);

  const closestDream = useMemo(() => {
    if (!data?.goals || data.goals.length === 0) return null;
    return data.goals.reduce((prev, curr) => {
      const prevPct = prev.savedAmount / prev.targetAmount;
      const currPct = curr.savedAmount / curr.targetAmount;
      return currPct > prevPct ? curr : prev;
    });
  }, [data?.goals]);

  const closestDreamProgress = closestDream
    ? Math.min(Math.round((closestDream.savedAmount / closestDream.targetAmount) * 100), 100)
    : 0;

  const { data: personalizedGreeting } = useQuery<PersonalizedGreeting>({
    queryKey: ["/api/guardian/greeting", user?.coupleId],
    enabled: !!user?.coupleId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: streakData } = useQuery<SavingsStreak>({
    queryKey: ["/api/guardian/streak", user?.coupleId],
    enabled: !!user?.coupleId,
    staleTime: 1000 * 60 * 5,
  });

  const greetingMessage = useMemo(() => {
    if (personalizedGreeting) {
      return {
        greeting: personalizedGreeting.greeting,
        message: personalizedGreeting.message,
        suggestion: personalizedGreeting.suggestion,
      };
    }
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    const partner1 = data?.partners?.partner1?.name || "there";
    if (!data?.goals || data.goals.length === 0) {
      return {
        greeting: `${timeGreeting}, ${partner1}`,
        message: "Your dreams are waiting to be set.",
        suggestion: "Start by adding your first dream together.",
      };
    }
    return {
      greeting: `${timeGreeting}, ${partner1}`,
      message: "Your dreams are being guarded.",
      suggestion: "Just log your expenses and I'll handle the rest.",
    };
  }, [personalizedGreeting, data]);

  const fetchNudges = useCallback(async () => {
    if (!user?.coupleId) return;
    setLoadingNudges(true);
    try {
      const response = await apiRequest("GET", `/api/nudges/${user.coupleId}`);
      if (response.ok) {
        const data = await response.json();
        setNudges(data);
      }
    } catch (error) {
      console.error("Error fetching nudges:", error);
    } finally {
      setLoadingNudges(false);
    }
  }, [user?.coupleId]);

  const detectPatterns = useCallback(async () => {
    if (!user?.coupleId) return;
    try {
      const response = await apiRequest("POST", "/api/patterns/detect", {
        coupleId: user.coupleId,
      });
      if (response.ok) {
        const { patterns } = await response.json();
        if (patterns.length > 0 && patterns[0].isHabitual) {
          await apiRequest("POST", "/api/nudges/generate", {
            coupleId: user.coupleId,
            patternId: patterns[0].id,
          });
          await fetchNudges();
        }
      }
    } catch (error) {
      console.error("Error detecting patterns:", error);
    }
  }, [user?.coupleId, fetchNudges]);

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges]);

  // Set Guardian greeting from personalized greeting
  useEffect(() => {
    if (greetingMessage.greeting) {
      const fullGreeting = greetingMessage.message
        ? `${greetingMessage.greeting}! ${greetingMessage.message}`
        : greetingMessage.greeting;
      guardianChat.setGreeting(fullGreeting);
    }
  }, [greetingMessage.greeting, greetingMessage.message]);

  useEffect(() => {
    if (currentMonthExpenses.length >= 5 && nudges.length === 0 && !loadingNudges) {
      detectPatterns();
    }
  }, [currentMonthExpenses.length, nudges.length, loadingNudges, detectPatterns]);

  const handleNudgeAccept = (nudge: Nudge) => {
    setNudges(prev => prev.filter(n => n.id !== nudge.id));
  };

  const handleNudgeDismiss = (nudge: Nudge) => {
    setNudges(prev => prev.filter(n => n.id !== nudge.id));
  };

  const remaining = Math.max(totalBudget - totalSpent, 0);
  const budgetPercentage = totalBudget > 0 ? Math.min(totalSpent / totalBudget, 1) : 0;
  const currentStreak = streakData?.currentStreak || 0;

  const weekExpenses = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return currentMonthExpenses.filter(e => new Date(e.date) >= weekAgo);
  }, [currentMonthExpenses]);

  const weekTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: Spacing.lg,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshData} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Guardian Conversation Area */}
        <View style={styles.chatSection}>
          {guardianChat.messages.map((msg) => (
            <GuardianMessageBubble
              key={msg.id}
              message={msg}
              onConfirm={guardianChat.confirmExpense}
              onDismiss={guardianChat.dismissExpense}
              onEdit={() => {
                if (msg.parsedExpense) {
                  guardianChat.dismissExpense();
                  navigation.navigate("AddExpense", {
                    prefilled: {
                      amount: msg.parsedExpense.amount,
                      merchant: msg.parsedExpense.merchant,
                      category: msg.parsedExpense.category,
                      description: msg.parsedExpense.description,
                      paidBy: msg.parsedExpense.paidBy,
                      splitMethod: msg.parsedExpense.splitMethod,
                    },
                  });
                }
              }}
              onUndo={guardianChat.undoAutoSave}
            />
          ))}
        </View>

        {/* Compact Dream Status */}
        <View style={styles.dreamGlow}>
          <Animated.View style={[styles.glowRing, { borderColor: theme.primary + "30" }, glowStyle]} />
          <View style={[styles.dreamCircle, { backgroundColor: theme.backgroundDefault }]}>
            {totalSaved > 0 ? (
              <>
                <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: 2 }}>
                  Dreams Protected
                </ThemedText>
                <ThemedText type="h2" style={{ color: theme.primary }}>
                  ${totalSaved.toLocaleString()}
                </ThemedText>
                {closestDream ? (
                  <ThemedText type="tiny" style={{ color: theme.success, marginTop: 4, fontWeight: "600" }}>
                    {closestDreamProgress}% to "{closestDream.name}"
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <>
                <Feather name="shield" size={28} color={theme.primary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}>
                  Your dreams are{"\n"}waiting to grow
                </ThemedText>
              </>
            )}
          </View>
        </View>

        {currentStreak > 0 ? (
          <View style={styles.streakRow}>
            <Feather name="zap" size={14} color="#F59E0B" />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {currentStreak} week savings streak
            </ThemedText>
          </View>
        ) : null}

        {nudges.length > 0 ? (
          <View style={styles.nudgeSection}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginBottom: Spacing.sm, letterSpacing: 1 }}>
              GUARDIAN NOTICED SOMETHING
            </ThemedText>
            {nudges.slice(0, 1).map((nudge) => (
              <NudgeCard
                key={nudge.id}
                nudge={nudge}
                coupleId={user?.coupleId || ""}
                onAccept={handleNudgeAccept}
                onDismiss={handleNudgeDismiss}
                onCommitmentCreated={refreshData}
              />
            ))}
          </View>
        ) : null}

        {/* Quick Actions — Scan + Full Form fallback */}
        <View style={styles.actionsSection}>
          <ActionButton
            icon="camera"
            label="Scan Receipt"
            subtitle="Snap a photo and we'll do the rest"
            color={theme.accent}
            onPress={() => navigation.navigate("ScanReceipt")}
            testID="button-scan-receipt"
          />
          <ActionButton
            icon="sliders"
            label="Detailed Entry"
            subtitle="Full form with all options"
            color={theme.textTertiary}
            onPress={() => navigation.navigate("AddExpense")}
            testID="button-add-expense"
          />
        </View>

        <View style={[styles.snapshot, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="tiny" style={{ color: theme.textSecondary, letterSpacing: 1, marginBottom: Spacing.md }}>
            THIS WEEK AT A GLANCE
          </ThemedText>
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotItem}>
              <ThemedText type="h4" style={{ color: theme.text }}>
                ${weekTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                spent this week
              </ThemedText>
            </View>
            <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
            <View style={styles.snapshotItem}>
              <ThemedText type="h4" style={{ color: budgetPercentage > 0.9 ? theme.error : budgetPercentage > 0.75 ? theme.warning : theme.success }}>
                ${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                left this month
              </ThemedText>
            </View>
            <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
            <View style={styles.snapshotItem}>
              <ThemedText type="h4" style={{ color: theme.primary }}>
                {data?.goals?.length || 0}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                {(data?.goals?.length || 0) === 1 ? "dream" : "dreams"}
              </ThemedText>
            </View>
          </View>
        </View>

        {greetingMessage.suggestion ? (
          <View style={styles.suggestionRow}>
            <Feather name="message-circle" size={14} color={theme.textTertiary} />
            <ThemedText type="small" style={{ color: theme.textTertiary, fontStyle: "italic", flex: 1 }}>
              {greetingMessage.suggestion}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

      {/* Guardian Input Bar — always visible at bottom, above tab bar */}
      <View style={{ marginBottom: tabBarHeight }}>
        <GuardianInput
          onSubmit={guardianChat.sendMessage}
          onCameraPress={() => navigation.navigate("ScanReceipt")}
          isProcessing={guardianChat.isProcessing}
          placeholder="Tell me about a purchase..."
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  chatSection: {
    marginBottom: Spacing.lg,
    minHeight: 60,
  },
  greetingSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  guardianAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  guardianImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  greetingText: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  guardianMessage: {
    textAlign: "center",
    lineHeight: 22,
  },
  dreamGlow: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    height: 180,
  },
  glowRing: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  dreamCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  actionsSection: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 2,
  },
  nudgeSection: {
    marginBottom: Spacing["2xl"],
  },
  snapshot: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  snapshotRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  snapshotItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  snapshotDivider: {
    width: 1,
    height: 36,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
});
