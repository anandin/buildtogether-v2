import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";

import { AIFeedbackToast } from "@/components/AIFeedbackToast";
import { useAuth } from "@/context/AuthContext";
import { useAIFeedback } from "@/context/AIFeedbackContext";
import { useTheme } from "@/hooks/useTheme";
import SignInScreen from "@/screens/SignInScreen";
import { BTApp } from "@/bt/BTApp";

/**
 * Top-level routing for the BuildTogether (Tilly) student-edition app.
 *
 * The flow:
 *   1. Auth loading → spinner
 *   2. Not authenticated → SignInScreen (Apple / Google / email)
 *   3. Authenticated → BTApp (Phase 2 inserts an onboarding gate inside
 *      BTApp itself when the household hasn't completed onboarding)
 *
 * The legacy V1 couples-tracker navigation is gone; BTApp owns its own
 * 6-tab bottom bar.
 */
export function AppContent() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentFeedback, dismissFeedback } = useAIFeedback();
  const { theme } = useTheme();

  if (authLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <SignInScreen />;
  }

  return (
    <View style={styles.container}>
      <BTApp />
      <AIFeedbackToast feedback={currentFeedback} onDismiss={dismissFeedback} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
});
