import "react-native-get-random-values";
// Wire SHA-512 into @noble/ed25519 at app boot so any consumer (not just
// the passkey module) can sign/verify without hitting the missing
// `crypto.subtle` on Hermes. See client/lib/passkey.ts for context.
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from "@expo-google-fonts/instrument-serif";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { AIFeedbackProvider } from "@/context/AIFeedbackContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { PasskeyGateProvider } from "@/context/PasskeyGateContext";
import { AppContent } from "@/components/AppContent";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    // V1 sans (still referenced by some legacy screens kept for Phase 5 rewrite)
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    // BT spec §3 typography — Instrument Serif for headlines/key numbers
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    // BT spec §3 — Inter as the UI body workhorse
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    // BT spec §3 — JetBrains Mono for mono labels & ledger amounts
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SubscriptionProvider>
            <AIFeedbackProvider>
              <SafeAreaProvider>
                <GestureHandlerRootView style={styles.root}>
                  <KeyboardProvider>
                    <PasskeyGateProvider>
                      <AppContent />
                      <StatusBar style="auto" />
                    </PasskeyGateProvider>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </SafeAreaProvider>
            </AIFeedbackProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
