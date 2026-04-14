import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Step = "names" | "family" | "location" | "generating" | "first-goal" | "complete";

const COUPLE_ID_KEY = "@couple_id";

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { updatePartnerName, addGoal, refreshData } = useApp();
  
  const [step, setStep] = useState<Step>("names");
  const [partner1Name, setPartner1Name] = useState("");
  const [partner2Name, setPartner2Name] = useState("");
  const [isSolo, setIsSolo] = useState(false);
  const [numKidsUnder5, setNumKidsUnder5] = useState(0);
  const [numKids5to12, setNumKids5to12] = useState(0);
  const [numTeens, setNumTeens] = useState(0);
  const [city, setCity] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [generatingStatus, setGeneratingStatus] = useState("Analyzing cost of living...");

  const totalKids = numKidsUnder5 + numKids5to12 + numTeens;
  const totalSteps = 4;

  const getCurrentStepNumber = () => {
    switch (step) {
      case "names": return 1;
      case "family": return 2;
      case "location": return 3;
      case "generating": return 3;
      case "first-goal": return 4;
      default: return 4;
    }
  };

  const handleNamesNext = async () => {
    // Solo mode: only partner1 required. Couple mode: both required.
    const valid = partner1Name.trim() && (isSolo || partner2Name.trim());
    if (valid) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updatePartnerName("partner1", partner1Name.trim());
      // In solo mode, partner2 stays as default placeholder until invite
      if (!isSolo) {
        await updatePartnerName("partner2", partner2Name.trim());
      }
      setStep("family");
    }
  };

  const handleFamilyNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("location");
  };

  const handleLocationNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep("generating");

    // Match the actual household. Solo users get 1 adult so their budget
    // benchmarks aren't silently inflated to a 2-income baseline.
    const numAdults = isSolo ? 1 : 2;

    try {
      const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
      if (coupleId) {
        setGeneratingStatus("Saving your family profile...");
        await apiRequest("PUT", `/api/family/${coupleId}`, {
          numAdults,
          numKidsUnder5,
          numKids5to12,
          numTeens,
          city: city.trim() || "New York",
          country: "US",
        });

        setGeneratingStatus("Looking up cost of living data...");
        await new Promise(resolve => setTimeout(resolve, 500));

        setGeneratingStatus("Generating personalized budgets...");
        await apiRequest("POST", `/api/budgets/${coupleId}/generate`, {
          city: city.trim() || "New York",
          numAdults,
          numKidsUnder5,
          numKids5to12,
          numTeens,
        });


        setGeneratingStatus("Finalizing your budget...");
        await refreshData();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error("Error generating budgets:", error);
    }
    
    setStep("first-goal");
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

  const NumberStepper = ({ 
    value, 
    onValueChange, 
    min = 0, 
    max = 10,
    label,
  }: { 
    value: number; 
    onValueChange: (v: number) => void;
    min?: number;
    max?: number;
    label: string;
  }) => (
    <View style={styles.stepperRow}>
      <ThemedText type="body" style={{ flex: 1 }}>{label}</ThemedText>
      <View style={styles.stepperControls}>
        <Pressable
          style={[
            styles.stepperButton,
            { 
              backgroundColor: value > min ? theme.primary + "20" : theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          onPress={() => {
            if (value > min) {
              onValueChange(value - 1);
              Haptics.selectionAsync();
            }
          }}
        >
          <Feather name="minus" size={18} color={value > min ? theme.primary : theme.textSecondary} />
        </Pressable>
        <View style={[styles.stepperValue, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>{value}</ThemedText>
        </View>
        <Pressable
          style={[
            styles.stepperButton,
            { 
              backgroundColor: value < max ? theme.primary + "20" : theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          onPress={() => {
            if (value < max) {
              onValueChange(value + 1);
              Haptics.selectionAsync();
            }
          }}
        >
          <Feather name="plus" size={18} color={value < max ? theme.primary : theme.textSecondary} />
        </Pressable>
      </View>
    </View>
  );

  const renderProgressBar = () => {
    if (step === "complete" || step === "generating") return null;
    
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          {[1, 2, 3, 4].map((num, index) => (
            <React.Fragment key={num}>
              <View style={[
                styles.progressStep, 
                { backgroundColor: num <= getCurrentStepNumber() ? theme.primary : theme.border }
              ]}>
                <ThemedText type="tiny" style={{ 
                  color: num <= getCurrentStepNumber() ? "#FFFFFF" : theme.textSecondary, 
                  fontWeight: "600" 
                }}>
                  {num}
                </ThemedText>
              </View>
              {index < 3 ? (
                <View style={[
                  styles.progressLine, 
                  { backgroundColor: num < getCurrentStepNumber() ? theme.primary : theme.border }
                ]} />
              ) : null}
            </React.Fragment>
          ))}
        </View>
        <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
          Step {getCurrentStepNumber()} of {totalSteps}
        </ThemedText>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView 
        contentContainerStyle={[
          styles.content, 
          { paddingTop: insets.top + Spacing["2xl"], paddingBottom: insets.bottom + Spacing.lg }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {renderProgressBar()}
        
        {step === "names" ? (
          <Animated.View 
            key="names"
            entering={FadeIn}
            exiting={SlideOutLeft}
            style={styles.stepContainer}
          >
            <View style={styles.header}>
              <ThemedText type="h2">Who's building together?</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Dream Guardian will learn each of your{"\n"}spending patterns and adapt its tips for you
              </ThemedText>
            </View>
            
            <Card style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {isSolo ? "Your name" : "Partner 1"}
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
                  returnKeyType={isSolo ? "done" : "next"}
                />
              </View>

              {!isSolo ? (
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
              ) : null}

              {/* Solo mode toggle */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsSolo(!isSolo);
                  if (!isSolo) setPartner2Name("");
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  marginTop: 4,
                }}
              >
                <Feather
                  name={isSolo ? "check-square" : "square"}
                  size={18}
                  color={isSolo ? theme.primary : theme.textSecondary}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>
                  {isSolo
                    ? "Building solo — I'll invite my partner later"
                    : "Building solo for now? (invite partner anytime)"}
                </ThemedText>
              </Pressable>
            </Card>

            <Pressable
              style={[
                styles.nextButton,
                {
                  backgroundColor: partner1Name.trim() && (isSolo || partner2Name.trim())
                    ? theme.primary
                    : theme.backgroundSecondary
                }
              ]}
              onPress={handleNamesNext}
              disabled={!partner1Name.trim() || (!isSolo && !partner2Name.trim())}
            >
              <ThemedText type="body" style={{
                color: partner1Name.trim() && (isSolo || partner2Name.trim()) ? "#FFFFFF" : theme.textSecondary,
                fontWeight: "600"
              }}>
                Continue
              </ThemedText>
              <Feather
                name="arrow-right"
                size={20}
                color={partner1Name.trim() && (isSolo || partner2Name.trim()) ? "#FFFFFF" : theme.textSecondary}
              />
            </Pressable>
          </Animated.View>
        ) : null}

        {step === "family" ? (
          <Animated.View 
            key="family"
            entering={SlideInRight}
            exiting={SlideOutLeft}
            style={styles.stepContainer}
          >
            <View style={styles.header}>
              <ThemedText type="h2">Tell us about your family</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                This helps us suggest realistic budgets{"\n"}and benchmark your spending
              </ThemedText>
            </View>
            
            <Card style={styles.inputCard}>
              <NumberStepper
                label="Kids under 5"
                value={numKidsUnder5}
                onValueChange={setNumKidsUnder5}
              />
              <NumberStepper
                label="Kids 5-12"
                value={numKids5to12}
                onValueChange={setNumKids5to12}
              />
              <NumberStepper
                label="Teenagers (13+)"
                value={numTeens}
                onValueChange={setNumTeens}
              />
            </Card>
            
            {totalKids > 0 ? (
              <View style={[styles.familyHint, { backgroundColor: theme.success + "15" }]}>
                <Feather name="users" size={16} color={theme.success} />
                <ThemedText type="small" style={{ color: theme.success, marginLeft: Spacing.sm }}>
                  Family of {2 + totalKids} - we'll adjust budget recommendations accordingly
                </ThemedText>
              </View>
            ) : null}
            
            <Pressable
              style={[styles.nextButton, { backgroundColor: theme.primary }]}
              onPress={handleFamilyNext}
            >
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                {totalKids > 0 ? "Continue" : "No kids, continue"}
              </ThemedText>
              <Feather name="arrow-right" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        ) : null}

        {step === "location" ? (
          <Animated.View 
            key="location"
            entering={SlideInRight}
            exiting={SlideOutLeft}
            style={styles.stepContainer}
          >
            <View style={styles.header}>
              <ThemedText type="h2">Where do you live?</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                We'll use local cost of living data to{"\n"}create personalized budget recommendations
              </ThemedText>
            </View>
            
            <Card style={styles.inputCard}>
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  City
                </ThemedText>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                  }]}
                  placeholder='e.g., "San Francisco" or "Austin, TX"'
                  placeholderTextColor={theme.textSecondary}
                  value={city}
                  onChangeText={setCity}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            </Card>
            
            <View style={[styles.benchmarkHint, { backgroundColor: theme.primary + "10" }]}>
              <Feather name="bar-chart-2" size={16} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.primary, marginLeft: Spacing.sm, flex: 1 }}>
                We'll benchmark your spending against similar families in your area
              </ThemedText>
            </View>
            
            <Pressable
              style={[styles.nextButton, { backgroundColor: theme.primary }]}
              onPress={handleLocationNext}
            >
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                Generate My Budget
              </ThemedText>
              <Feather name="zap" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        ) : null}

        {step === "generating" ? (
          <Animated.View 
            key="generating"
            entering={FadeIn}
            style={styles.completeContainer}
          >
            <View style={[styles.loadingCircle, { backgroundColor: theme.primary + "15" }]}>
              <ActivityIndicator size="large" color={theme.primary} />
            </View>
            <ThemedText type="h2" style={{ textAlign: "center" }}>
              Creating Your Budget
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              {generatingStatus}
            </ThemedText>
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
              <View style={[styles.successBadge, { backgroundColor: theme.success + "15" }]}>
                <Feather name="check-circle" size={20} color={theme.success} />
                <ThemedText type="small" style={{ color: theme.success, marginLeft: Spacing.xs }}>
                  Budget created based on {city.trim() || "your location"}
                </ThemedText>
              </View>
              <ThemedText type="h2">What's your first dream?</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Dream Guardian will observe your habits{"\n"}and nudge you toward this goal
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
        
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
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
  progressContainer: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  progressStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  progressLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
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
  loadingCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stepperValue: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
  },
  familyHint: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  benchmarkHint: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
});
