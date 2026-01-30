import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { WelcomeScreen } from "@/screens/WelcomeScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import SignInScreen from "@/screens/SignInScreen";
import { AIFeedbackToast } from "@/components/AIFeedbackToast";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useAIFeedback } from "@/context/AIFeedbackContext";
import { useTheme } from "@/hooks/useTheme";

type OnboardingStep = "welcome" | "onboarding" | "complete";

export function AppContent() {
  const { data, loading, completeOnboarding } = useApp();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentFeedback, dismissFeedback } = useAIFeedback();
  const { theme } = useTheme();
  const [step, setStep] = useState<OnboardingStep>("welcome");

  if (loading || authLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <SignInScreen />;
  }

  const hasCompletedOnboarding = data?.hasCompletedOnboarding === true;
  const isPartnerB = user?.partnerRole === "partner2";
  const joinedExistingCouple = data?.connectedSince !== null && isPartnerB;

  if (!hasCompletedOnboarding && !joinedExistingCouple) {
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
    <View style={styles.container}>
      <NavigationContainer>
        <RootStackNavigator />
      </NavigationContainer>
      <AIFeedbackToast 
        feedback={currentFeedback} 
        onDismiss={dismissFeedback} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
