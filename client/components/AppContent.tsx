import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";

import { AIFeedbackToast } from "@/components/AIFeedbackToast";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useAIFeedback } from "@/context/AIFeedbackContext";
import { useTheme } from "@/hooks/useTheme";
import { BTApp } from "@/bt/BTApp";

/**
 * Per BUILDTOGETHER_SPEC.md, the app is now the BuildTogether (Tilly)
 * student-edition experience. The legacy couples-tracker navigation in
 * `RootStackNavigator` is retained in the codebase but no longer wired
 * into the shell — Tilly is the surface.
 *
 * Auth gate: while loading, show a spinner; otherwise render the BT shell
 * unconditionally. The spec's flow doesn't depend on the V1 sign-in/onboarding
 * couple model, so we skip those screens here.
 */
export function AppContent() {
  const { loading } = useApp();
  const { isLoading: authLoading } = useAuth();
  const { currentFeedback, dismissFeedback } = useAIFeedback();
  const { theme } = useTheme();

  if (loading || authLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BTApp />
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
