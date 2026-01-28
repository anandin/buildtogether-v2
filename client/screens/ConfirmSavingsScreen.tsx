import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, TextInput, Image, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useAIFeedback } from "@/context/AIFeedbackContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

type ConfirmSavingsNavigationProp = NativeStackNavigationProp<RootStackParamList, "ConfirmSavings">;
type ConfirmSavingsRouteProp = RouteProp<RootStackParamList, "ConfirmSavings">;

interface SavingsStreak {
  currentStreak: number;
  longestStreak: number;
  totalConfirmations: number;
  totalAmountSaved: number;
}

const COUPLE_ID_KEY = "@build_together_couple_id";

const CONFIRMATION_TYPES = [
  { id: "bank_transfer", label: "Bank Transfer", icon: "send" as const, description: "Moved to savings account" },
  { id: "auto_transfer", label: "Auto-Transfer", icon: "repeat" as const, description: "Automatic savings" },
  { id: "cash_saved", label: "Cash Saved", icon: "dollar-sign" as const, description: "Set aside cash" },
];

const QUICK_AMOUNTS = [25, 50, 100, 200, 500];

export default function ConfirmSavingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<ConfirmSavingsNavigationProp>();
  const route = useRoute<ConfirmSavingsRouteProp>();
  const { theme } = useTheme();
  const { data, refreshData } = useApp();
  const { user } = useAuth();
  const { showCelebration } = useAIFeedback();
  const queryClient = useQueryClient();
  
  const [amount, setAmount] = useState(route.params?.suggestedAmount?.toString() || "");
  const [confirmationType, setConfirmationType] = useState("bank_transfer");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(route.params?.goalId || null);
  const [note, setNote] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  
  const celebrationScale = useSharedValue(1);
  
  useEffect(() => {
    AsyncStorage.getItem(COUPLE_ID_KEY).then(id => {
      if (id) setCoupleId(id);
    });
  }, []);
  
  const { data: streakData } = useQuery<SavingsStreak>({
    queryKey: ["/api/guardian/streak", coupleId],
    enabled: !!coupleId,
  });
  
  const confirmSavingsMutation = useMutation({
    mutationFn: async (savingsData: {
      amount: number;
      confirmationType: string;
      goalId?: string | null;
      note?: string;
      triggeredBy?: string;
      recommendationId?: string;
    }) => {
      const url = new URL(`/api/guardian/savings/${coupleId}`, getApiUrl());
      return apiRequest("POST", url.toString(), {
        ...savingsData,
        confirmationDate: new Date().toISOString().split("T")[0],
      });
    },
    onSuccess: async (_, variables) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      celebrationScale.value = withSequence(
        withSpring(1.2, { damping: 2 }),
        withSpring(1, { damping: 8 })
      );
      setShowSuccess(true);
      
      queryClient.invalidateQueries({ queryKey: ["/api/guardian/streak"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guardian/savings"] });
      
      if (selectedGoalId) {
        await refreshData();
      }
      
      // Get AI celebration feedback for the deposit
      try {
        const goal = data?.goals?.find(g => g.id === selectedGoalId);
        const newStreak = (streakData?.currentStreak || 0) + 1;
        
        const feedbackResponse = await fetch(
          new URL("/api/guardian/deposit-feedback", getApiUrl()).toString(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              coupleId: user?.coupleId || coupleId,
              amount: variables.amount,
              goalName: goal?.name || "your dream",
              goalProgress: goal ? {
                current: (goal.savedAmount || 0) + variables.amount,
                target: goal.targetAmount,
                averageDailyRate: goal.savedAmount && goal.createdAt 
                  ? goal.savedAmount / Math.max(1, Math.floor((Date.now() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
                  : 10,
              } : null,
              streakDays: newStreak,
              previousDeposit: streakData?.totalAmountSaved && streakData?.totalConfirmations 
                ? streakData.totalAmountSaved / streakData.totalConfirmations
                : null,
            }),
          }
        );
        
        if (feedbackResponse.ok) {
          const feedback = await feedbackResponse.json();
          showCelebration(feedback.title, feedback.message);
        }
      } catch (feedbackError) {
        // Non-critical, show generic celebration
        showCelebration("Dream Deposit!", `$${variables.amount} saved toward your dreams!`);
      }
      
      setTimeout(() => {
        navigation.goBack();
      }, 2500);
    },
  });
  
  const celebrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
  }));
  
  const handleConfirm = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    
    confirmSavingsMutation.mutate({
      amount: numAmount,
      confirmationType,
      goalId: selectedGoalId,
      note: note || undefined,
      triggeredBy: "partner1",
      recommendationId: route.params?.recommendationId,
    });
  };
  
  const handleQuickAmount = (quickAmount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount(quickAmount.toString());
  };
  
  if (showSuccess) {
    return (
      <View style={[styles.successContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Animated.View style={[styles.successContent, celebrationStyle]}>
          <View style={[styles.successIcon, { backgroundColor: theme.success + "20" }]}>
            <Feather name="check-circle" size={64} color={theme.success} />
          </View>
          <ThemedText type="h2" style={styles.successTitle}>
            Savings Confirmed!
          </ThemedText>
          <ThemedText type="body" style={[styles.successMessage, { color: theme.textSecondary }]}>
            ${parseFloat(amount).toFixed(0)} has been logged to your savings journey.
          </ThemedText>
          {streakData?.currentStreak ? (
            <View style={[styles.streakBadge, { backgroundColor: "#F59E0B20" }]}>
              <Feather name="zap" size={20} color="#F59E0B" />
              <ThemedText type="body" style={{ color: "#F59E0B", fontWeight: "600" }}>
                {streakData.currentStreak + 1} week streak!
              </ThemedText>
            </View>
          ) : null}
        </Animated.View>
      </View>
    );
  }
  
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.header}>
        <Image source={dreamGuardianIcon} style={styles.guardianImage} />
        <View style={styles.headerText}>
          <ThemedText type="heading">Confirm Your Savings</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Log when you transfer money to savings - no bank linking needed!
          </ThemedText>
        </View>
      </View>
      
      <Card style={styles.amountCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          Amount Saved
        </ThemedText>
        <View style={styles.amountInputRow}>
          <ThemedText type="h1" style={{ fontSize: 32 }}>$</ThemedText>
          <TextInput
            style={[styles.amountInput, { color: theme.text }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            autoFocus
          />
        </View>
        
        <View style={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((quickAmount) => (
            <Pressable
              key={quickAmount}
              style={[
                styles.quickAmountButton,
                { 
                  backgroundColor: amount === quickAmount.toString() 
                    ? theme.primary 
                    : theme.primary + "20" 
                }
              ]}
              onPress={() => handleQuickAmount(quickAmount)}
            >
              <ThemedText 
                type="small" 
                style={{ 
                  color: amount === quickAmount.toString() ? "#FFFFFF" : theme.primary,
                  fontWeight: "600" 
                }}
              >
                ${quickAmount}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Card>
      
      <Card style={styles.typeCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
          How did you save?
        </ThemedText>
        {CONFIRMATION_TYPES.map((type) => (
          <Pressable
            key={type.id}
            style={[
              styles.typeOption,
              { 
                backgroundColor: confirmationType === type.id 
                  ? theme.primary + "15" 
                  : theme.backgroundSecondary,
                borderColor: confirmationType === type.id 
                  ? theme.primary 
                  : "transparent",
              }
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setConfirmationType(type.id);
            }}
          >
            <View style={[styles.typeIcon, { backgroundColor: theme.primary + "20" }]}>
              <Feather name={type.icon} size={20} color={theme.primary} />
            </View>
            <View style={styles.typeText}>
              <ThemedText type="body" style={{ fontWeight: "500" }}>{type.label}</ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                {type.description}
              </ThemedText>
            </View>
            {confirmationType === type.id ? (
              <Feather name="check-circle" size={20} color={theme.primary} />
            ) : null}
          </Pressable>
        ))}
      </Card>
      
      {data?.goals && data.goals.length > 0 ? (
        <Card style={styles.goalCard}>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
            Link to a Dream (optional)
          </ThemedText>
          <View style={styles.goalOptions}>
            <Pressable
              style={[
                styles.goalOption,
                { 
                  backgroundColor: selectedGoalId === null 
                    ? theme.primary + "15" 
                    : theme.backgroundSecondary,
                  borderColor: selectedGoalId === null ? theme.primary : "transparent",
                }
              ]}
              onPress={() => setSelectedGoalId(null)}
            >
              <ThemedText type="small" style={{ color: selectedGoalId === null ? theme.primary : theme.text }}>
                General Savings
              </ThemedText>
            </Pressable>
            {data.goals.map((goal) => (
              <Pressable
                key={goal.id}
                style={[
                  styles.goalOption,
                  { 
                    backgroundColor: selectedGoalId === goal.id 
                      ? theme.primary + "15" 
                      : theme.backgroundSecondary,
                    borderColor: selectedGoalId === goal.id ? theme.primary : "transparent",
                  }
                ]}
                onPress={() => setSelectedGoalId(goal.id)}
              >
                <ThemedText type="small">
                  {goal.emoji} {goal.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
      
      <Card style={styles.noteCard}>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          Note (optional)
        </ThemedText>
        <TextInput
          style={[styles.noteInput, { color: theme.text, borderColor: theme.border }]}
          value={note}
          onChangeText={setNote}
          placeholder="e.g., Birthday money saved!"
          placeholderTextColor={theme.textSecondary}
          multiline
        />
      </Card>
      
      <Button
        onPress={handleConfirm}
        disabled={!amount || parseFloat(amount) <= 0 || confirmSavingsMutation.isPending}
        style={styles.confirmButton}
      >
        {confirmSavingsMutation.isPending ? "Confirming..." : "Confirm Savings"}
      </Button>
      
      <ThemedText type="tiny" style={[styles.disclaimer, { color: theme.textSecondary }]}>
        This is a self-reported confirmation. We'll track your savings streak based on your entries.
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  guardianImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  headerText: {
    flex: 1,
    gap: Spacing.xs,
  },
  amountCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  amountInput: {
    fontSize: 48,
    fontWeight: "700",
    minWidth: 120,
    textAlign: "center",
  },
  quickAmounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "center",
  },
  quickAmountButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  typeCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    borderWidth: 2,
  },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  typeText: {
    flex: 1,
    gap: 2,
  },
  goalCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  goalOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  goalOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
  },
  noteCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 60,
    textAlignVertical: "top",
  },
  confirmButton: {
    marginBottom: Spacing.md,
  },
  disclaimer: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  successContent: {
    alignItems: "center",
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  successTitle: {
    marginBottom: Spacing.md,
  },
  successMessage: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
});
