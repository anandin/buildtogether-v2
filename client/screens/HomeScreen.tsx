import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";

import { BudgetCard } from "@/components/BudgetCard";
import { QuickActions } from "@/components/QuickActions";
import { DreamGuardian } from "@/components/DreamGuardian";
import { NudgeCard } from "@/components/NudgeCard";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { PremiumGate } from "@/components/PremiumGate";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getCurrentMonthExpenses, getTotalSpent } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";
import { getApiUrl } from "@/lib/query-client";

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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [loadingNudges, setLoadingNudges] = useState(false);

  const currentMonthExpenses = data ? getCurrentMonthExpenses(data.expenses) : [];
  const totalSpent = getTotalSpent(currentMonthExpenses);

  const totalBudget = useMemo(() => {
    if (!data?.categoryBudgets) return 2000;
    return data.categoryBudgets.reduce((sum, b) => sum + b.monthlyLimit, 0);
  }, [data?.categoryBudgets]);

  const fetchNudges = useCallback(async () => {
    if (!user?.coupleId || !isPremium) return;
    
    setLoadingNudges(true);
    try {
      const response = await fetch(
        new URL(`/api/nudges/${user.coupleId}`, getApiUrl()).toString()
      );
      if (response.ok) {
        const data = await response.json();
        setNudges(data);
      }
    } catch (error) {
      console.error("Error fetching nudges:", error);
    } finally {
      setLoadingNudges(false);
    }
  }, [user?.coupleId, isPremium]);

  const detectPatterns = useCallback(async () => {
    if (!user?.coupleId || !isPremium) return;
    
    try {
      const response = await fetch(
        new URL("/api/patterns/detect", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coupleId: user.coupleId }),
        }
      );
      
      if (response.ok) {
        const { patterns } = await response.json();
        if (patterns.length > 0 && patterns[0].isHabitual) {
          await fetch(
            new URL("/api/nudges/generate", getApiUrl()).toString(),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                coupleId: user.coupleId, 
                patternId: patterns[0].id 
              }),
            }
          );
          await fetchNudges();
        }
      }
    } catch (error) {
      console.error("Error detecting patterns:", error);
    }
  }, [user?.coupleId, isPremium, fetchNudges]);

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges]);

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

  const handleAddExpense = () => {
    navigation.navigate("AddExpense");
  };

  const handleScanReceipt = () => {
    navigation.navigate("ScanReceipt");
  };

  const handleAddDream = () => {
    navigation.navigate("AddDream");
  };

  const handleAddToDream = () => {
    if (data?.goals && data.goals.length > 0) {
      navigation.navigate("DreamDetail", { dreamId: data.goals[0].id });
    } else {
      navigation.navigate("AddDream");
    }
  };

  const recentExpenses = useMemo(() => {
    return currentMonthExpenses
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [currentMonthExpenses]);

  const renderContent = () => (
    <View style={styles.content}>
      {isPremium && nudges.length > 0 ? (
        <View style={styles.nudgesSection}>
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

      {isPremium ? (
        <DreamGuardian 
          onAddToGoal={handleAddToDream} 
          coupleId={user?.coupleId ?? undefined}
        />
      ) : (
        <PremiumGate 
          feature="Dream Guardian AI"
          description="Your self-learning AI companion that observes your habits and delivers hyper-personalized nudges to help you save"
        >
          <DreamGuardian 
            onAddToGoal={handleAddToDream} 
            coupleId={user?.coupleId ?? undefined}
          />
        </PremiumGate>
      )}

      <QuickActions
        onAddExpense={handleAddExpense}
        onScanReceipt={handleScanReceipt}
        onAddGoal={handleAddDream}
      />

      <BudgetCard
        spent={totalSpent}
        limit={totalBudget}
        month={new Date().toLocaleString("default", { month: "long" })}
        compact
      />

      <Card style={styles.recentCard}>
        <View style={styles.recentHeader}>
          <ThemedText type="heading">Recent Activity</ThemedText>
          <Pressable onPress={() => navigation.navigate("ExpensesTab")}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              See all
            </ThemedText>
          </Pressable>
        </View>
        
        {recentExpenses.length > 0 ? (
          recentExpenses.map((expense) => (
            <Pressable
              key={expense.id}
              style={styles.recentItem}
              onPress={() => navigation.navigate("ExpenseDetail", { expenseId: expense.id })}
            >
              <View style={[
                styles.categoryIcon,
                { backgroundColor: (CATEGORY_COLORS[expense.category] || theme.primary) + "15" }
              ]}>
                <Feather
                  name={(CATEGORY_ICONS[expense.category] || "circle") as any}
                  size={16}
                  color={CATEGORY_COLORS[expense.category] || theme.primary}
                />
              </View>
              <View style={styles.recentInfo}>
                <ThemedText type="body" numberOfLines={1}>
                  {expense.description}
                </ThemedText>
                <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                  {CATEGORY_LABELS[expense.category] || expense.category} · {format(new Date(expense.date), "MMM d")}
                </ThemedText>
              </View>
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                ${expense.amount.toFixed(2)}
              </ThemedText>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyRecent}>
            <Feather name="inbox" size={32} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
              No expenses yet this month
            </ThemedText>
          </View>
        )}
      </Card>
    </View>
  );

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={[{ key: "content" }]}
      renderItem={renderContent}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refreshData} />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  recentCard: {
    marginTop: Spacing.lg,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  recentInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    gap: 2,
  },
  emptyRecent: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  nudgesSection: {
    marginBottom: Spacing.md,
  },
});
