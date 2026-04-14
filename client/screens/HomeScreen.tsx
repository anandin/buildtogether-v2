/**
 * GuardianHomeScreen — the agent-first home.
 *
 * Layout (top to bottom):
 *   1. Compact StatusRail (harmony + budget + partner avatars)
 *   2. Guardian conversation area (greeting, messages, confirmations)
 *   3. Horizontal cards rail (dreams + budget categories as compact cards)
 *   4. Top nudge (if any)
 *   5. GuardianInput docked at the bottom, above tab bar
 *
 * Deliberately removed from V1:
 *   - The 160px "Dreams Protected" donut circle
 *   - The "Scan Receipt" and "Detailed Entry" action buttons in the middle
 *     of the screen (GuardianInput handles both entry paths)
 *   - The "THIS WEEK AT A GLANCE" all-caps tracking-label widget
 */
import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { NudgeCard } from "@/components/NudgeCard";
import { ThemedText } from "@/components/ThemedText";
import { GuardianInput } from "@/components/GuardianInput";
import { GuardianMessageBubble } from "@/components/GuardianMessageBubble";
import { GuardianGreetingSkeleton } from "@/components/GuardianGreetingSkeleton";
import { StatusRail } from "@/components/StatusRail";
import { CompactDreamCard } from "@/components/CompactDreamCard";
import { CompactBudgetCard } from "@/components/CompactBudgetCard";
import { useTheme } from "@/hooks/useTheme";
import { useGuardianChat } from "@/hooks/useGuardianChat";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

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
  context?: {
    timeOfDay: string;
    currentStreak: number;
    totalSaved: number;
    goalsCount: number;
    closestGoalProgress: number | null;
  };
}

export default function GuardianHomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const guardianChat = useGuardianChat();

  const [nudges, setNudges] = useState<Nudge[]>([]);

  // -------- derived state (lightweight; no big circle math anymore) --------

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const budgetRemaining = Math.max(totalBudget - totalSpent, 0);

  const isSolo = !data?.partners?.partner2?.name || data.partners.partner2.name === "Partner" || data.partners.partner2.name === "";

  // Harmony = dreams saved vs ego spending (simplified)
  const totalSaved = useMemo(
    () => (data?.goals || []).reduce((s, g) => s + g.savedAmount, 0),
    [data?.goals],
  );
  const EGO_CATEGORIES = ["shopping", "entertainment", "restaurants", "personal", "gifts"];
  const egoSpent = currentMonthExpenses
    .filter(e => EGO_CATEGORIES.includes(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const harmonyPct = useMemo(() => {
    const denom = totalSaved + egoSpent;
    if (denom === 0) return 50;
    return Math.round((totalSaved / denom) * 100);
  }, [totalSaved, egoSpent]);

  // Cards rail: top 2 dreams by progress + top 2 budget categories
  const topDreams = useMemo(() => {
    if (!data?.goals) return [];
    return [...data.goals]
      .sort((a, b) => (b.savedAmount / b.targetAmount) - (a.savedAmount / a.targetAmount))
      .slice(0, 2);
  }, [data?.goals]);

  const topBudgets = useMemo(() => {
    if (!data?.categoryBudgets) return [];
    // Show the 2 categories closest to their cap (most actionable)
    return [...data.categoryBudgets]
      .map(b => {
        const spent = currentMonthExpenses
          .filter(e => e.category === b.category)
          .reduce((s, e) => s + e.amount, 0);
        return { ...b, spent };
      })
      .sort((a, b) => (b.spent / b.monthlyLimit) - (a.spent / a.monthlyLimit))
      .slice(0, 2);
  }, [data?.categoryBudgets, currentMonthExpenses]);

  // -------- greeting + nudges --------

  const { data: personalizedGreeting } = useQuery<PersonalizedGreeting>({
    queryKey: ["/api/guardian/greeting", user?.coupleId],
    enabled: !!user?.coupleId,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (personalizedGreeting?.greeting) {
      const full = personalizedGreeting.message
        ? `${personalizedGreeting.greeting}! ${personalizedGreeting.message}`
        : personalizedGreeting.greeting;
      guardianChat.setGreeting(full);
    }
  }, [personalizedGreeting?.greeting, personalizedGreeting?.message]);

  const fetchNudges = useCallback(async () => {
    if (!user?.coupleId) return;
    try {
      const res = await apiRequest("GET", `/api/nudges/${user.coupleId}`);
      if (res.ok) setNudges(await res.json());
    } catch {}
  }, [user?.coupleId]);

  useEffect(() => { fetchNudges(); }, [fetchNudges]);

  const showSkeleton = !personalizedGreeting && guardianChat.messages.length === 0;

  // -------- render --------

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: tabBarHeight + 90, // room above floating input
          paddingHorizontal: Spacing.lg,
          gap: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshData} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. StatusRail — compact at-a-glance state */}
        <StatusRail
          harmonyPct={harmonyPct}
          budgetRemaining={budgetRemaining}
          partner1Name={data?.partners?.partner1?.name || user?.name || "You"}
          partner1Color={data?.partners?.partner1?.color || theme.primary}
          partner2Name={data?.partners?.partner2?.name}
          partner2Color={data?.partners?.partner2?.color}
          isSolo={isSolo}
          onInvitePartner={() => navigation.navigate("PartnerInvite")}
        />

        {/* 2. Guardian conversation area */}
        <View style={styles.chatSection}>
          {showSkeleton ? <GuardianGreetingSkeleton /> : null}
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
                    prefilled: msg.parsedExpense,
                  });
                }
              }}
              onUndo={guardianChat.undoAutoSave}
            />
          ))}
          {personalizedGreeting?.suggestion ? (
            <View style={styles.suggestionRow}>
              <Feather name="zap" size={14} color={theme.aiPrimary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
                {personalizedGreeting.suggestion}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* 3. Cards rail — dreams + budgets */}
        {(topDreams.length > 0 || topBudgets.length > 0) ? (
          <View style={styles.railSection}>
            <View style={styles.railHeader}>
              <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
                Your week at a glance
              </ThemedText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railScroll}
            >
              {topDreams.map((g) => (
                <CompactDreamCard
                  key={g.id}
                  emoji={g.emoji || "⭐"}
                  name={g.name}
                  savedAmount={g.savedAmount}
                  targetAmount={g.targetAmount}
                  color={g.color || theme.primary}
                  onPress={() => navigation.navigate("DreamDetail", { dreamId: g.id })}
                />
              ))}
              {topBudgets.map((b) => (
                <CompactBudgetCard
                  key={b.id}
                  label={b.category}
                  spent={b.spent}
                  limit={b.monthlyLimit}
                  onPress={() => navigation.navigate("ExpensesTab")}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* 4. Top nudge — if Guardian spotted something */}
        {nudges.length > 0 ? (
          <NudgeCard
            nudge={nudges[0]}
            coupleId={user?.coupleId || ""}
            onAccept={(n) => setNudges((p) => p.filter((x) => x.id !== n.id))}
            onDismiss={(n) => setNudges((p) => p.filter((x) => x.id !== n.id))}
            onCommitmentCreated={refreshData}
          />
        ) : null}
      </ScrollView>

      {/* 5. Guardian Input — floats above tab bar */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: tabBarHeight,
        }}
      >
        <GuardianInput
          onSubmit={guardianChat.sendMessage}
          onCameraPress={() => navigation.navigate("ScanReceipt")}
          isProcessing={guardianChat.isProcessing}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  chatSection: {
    minHeight: 60,
    gap: Spacing.xs,
  },
  railSection: {
    gap: Spacing.sm,
  },
  railHeader: {
    paddingHorizontal: Spacing.xs,
  },
  railScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
