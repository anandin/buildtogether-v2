import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Step = "names" | "first-goal" | "complete";

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { updatePartnerName, addGoal } = useApp();
  
  const [step, setStep] = useState<Step>("names");
  const [partner1Name, setPartner1Name] = useState("");
  const [partner2Name, setPartner2Name] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");

  const handleNamesNext = async () => {
    if (partner1Name.trim() && partner2Name.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updatePartnerName("partner1", partner1Name.trim());
      await updatePartnerName("partner2", partner2Name.trim());
      setStep("first-goal");
    }
  };

  const handleGoalNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (goalName.trim() && goalAmount.trim()) {
      const amount = parseFloat(goalAmount);
      if (!isNaN(amount) && amount > 0) {
        await addGoal({
          name: goalName.trim(),
          targetAmount: amount,
          emoji: "star",
          color: "#6366F1",
        });
      }
    }
    
    setStep("complete");
    setTimeout(onComplete, 1500);
  };

  const handleSkipGoal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("complete");
    setTimeout(onComplete, 1500);
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.content, { paddingTop: insets.top + Spacing["2xl"], paddingBottom: insets.bottom + Spacing.lg }]}>
        
        {step === "names" ? (
          <Animated.View 
            key="names"
            entering={FadeIn}
            exiting={SlideOutLeft}
            style={styles.stepContainer}
          >
            <View style={styles.header}>
              <View style={[styles.stepIndicator, { backgroundColor: theme.primary }]}>
                <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>1</ThemedText>
              </View>
              <ThemedText type="h2">Who's building together?</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Enter your names so your Dream Guardian{"\n"}knows who to cheer for!
              </ThemedText>
            </View>
            
            <Card style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Partner 1
                </ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                  }]}
                  placeholder="Your name"
                  placeholderTextColor={theme.textSecondary}
                  value={partner1Name}
                  onChangeText={setPartner1Name}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Partner 2
                </ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                  }]}
                  placeholder="Partner's name"
                  placeholderTextColor={theme.textSecondary}
                  value={partner2Name}
                  onChangeText={setPartner2Name}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            </Card>
            
            <Pressable
              style={[
                styles.nextButton, 
                { 
                  backgroundColor: partner1Name.trim() && partner2Name.trim() 
                    ? theme.primary 
                    : theme.backgroundSecondary 
                }
              ]}
              onPress={handleNamesNext}
              disabled={!partner1Name.trim() || !partner2Name.trim()}
            >
              <ThemedText type="body" style={{ 
                color: partner1Name.trim() && partner2Name.trim() ? "#FFFFFF" : theme.textSecondary,
                fontWeight: "600" 
              }}>
                Continue
              </ThemedText>
              <Feather 
                name="arrow-right" 
                size={20} 
                color={partner1Name.trim() && partner2Name.trim() ? "#FFFFFF" : theme.textSecondary} 
              />
            </Pressable>
          </Animated.View>
        ) : null}

        {step === "first-goal" ? (
          <Animated.View 
            key="goal"
            entering={SlideInRight}
            exiting={SlideOutLeft}
            style={styles.stepContainer}
          >
            <View style={styles.header}>
              <View style={[styles.stepIndicator, { backgroundColor: theme.success }]}>
                <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>2</ThemedText>
              </View>
              <ThemedText type="h2">What are you saving for?</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Create your first shared dream.{"\n"}This is what you're building toward together!
              </ThemedText>
            </View>
            
            <Card style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Dream name
                </ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                  }]}
                  placeholder='e.g., "Beach Vacation" or "New Couch"'
                  placeholderTextColor={theme.textSecondary}
                  value={goalName}
                  onChangeText={setGoalName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Target amount
                </ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                  }]}
                  placeholder="$0"
                  placeholderTextColor={theme.textSecondary}
                  value={goalAmount}
                  onChangeText={setGoalAmount}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
              </View>
            </Card>
            
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.skipButton, { backgroundColor: theme.backgroundSecondary }]}
                onPress={handleSkipGoal}
              >
                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                  Skip for now
                </ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.nextButton, styles.flexButton, { backgroundColor: theme.success }]}
                onPress={handleGoalNext}
              >
                <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  {goalName.trim() && goalAmount.trim() ? "Create Dream" : "Continue"}
                </ThemedText>
                <Feather name="arrow-right" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {step === "complete" ? (
          <Animated.View 
            key="complete"
            entering={FadeIn}
            style={styles.completeContainer}
          >
            <View style={[styles.checkCircle, { backgroundColor: theme.success + "20" }]}>
              <Feather name="check" size={48} color={theme.success} />
            </View>
            <ThemedText type="h2" style={{ textAlign: "center" }}>
              You're all set!
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              Your Dream Guardian is ready to help{"\n"}you build your future together.
            </ThemedText>
          </Animated.View>
        ) : null}
        
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  stepContainer: {
    flex: 1,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  stepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  inputCard: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  skipButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  flexButton: {
    flex: 2,
  },
  completeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
});
