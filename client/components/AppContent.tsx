import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

type OnboardingStep = "welcome" | "onboarding" | "complete";

export function AppContent() {
  const { data, loading, completeOnboarding } = useApp();
  const { theme } = useTheme();
  const [step, setStep] = useState<OnboardingStep>("welcome");

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const hasCompletedOnboarding = data?.hasCompletedOnboarding === true;

  if (!hasCompletedOnboarding) {
    if (step === "welcome") {
      return (
        <WelcomeScreen 
          onGetStarted={() => setStep("onboarding")} 
        />
      );
    }

    if (step === "onboarding") {
      return (
        <OnboardingScreen 
          onComplete={async () => {
            await completeOnboarding();
            setStep("complete");
          }} 
        />
      );
    }
  }

  return (
    <NavigationContainer>
      <RootStackNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
