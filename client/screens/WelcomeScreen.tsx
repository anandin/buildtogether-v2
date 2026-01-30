import React from "react";
import { View, StyleSheet, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onGetStarted();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <LinearGradient
        colors={[theme.primary + "15", theme.accent + "10", "transparent"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <View style={[styles.content, { paddingTop: insets.top + Spacing["2xl"] }]}>
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="heart" size={48} color={theme.primary} />
          </View>
          
          <ThemedText type="h1" style={styles.title}>
            Build Together
          </ThemedText>
          
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your personal finance companion{"\n"}that learns what works for you
          </ThemedText>
        </View>
        
        <View style={styles.featuresSection}>
          <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            HOW IT WORKS
          </ThemedText>
          
          <View style={styles.layerItem}>
            <View style={[styles.layerNumber, { backgroundColor: theme.primary + "15" }]}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>1</ThemedText>
            </View>
            <View style={styles.layerContent}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>You just add expenses</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Snap receipts or type naturally
              </ThemedText>
            </View>
          </View>
          
          <View style={[styles.layerDivider, { backgroundColor: theme.border }]} />
          
          <View style={styles.layerItem}>
            <View style={[styles.layerNumber, { backgroundColor: theme.accent + "15" }]}>
              <ThemedText type="small" style={{ color: theme.accent, fontWeight: "700" }}>2</ThemedText>
            </View>
            <View style={styles.layerContent}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>We handle the rest</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Categorize, split, settle, track
              </ThemedText>
            </View>
          </View>
          
          <View style={[styles.layerDivider, { backgroundColor: theme.border }]} />
          
          <View style={styles.layerItem}>
            <View style={[styles.layerNumber, { backgroundColor: theme.aiPrimary + "15" }]}>
              <ThemedText type="small" style={{ color: theme.aiPrimary, fontWeight: "700" }}>3</ThemedText>
            </View>
            <View style={styles.layerContent}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Dream Guardian learns you</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Observes, learns, nudges, adapts
              </ThemedText>
            </View>
          </View>
          
          <View style={[styles.layerDivider, { backgroundColor: theme.border }]} />
          
          <View style={styles.layerItem}>
            <View style={[styles.layerNumber, { backgroundColor: theme.success + "15" }]}>
              <ThemedText type="small" style={{ color: theme.success, fontWeight: "700" }}>4</ThemedText>
            </View>
            <View style={styles.layerContent}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Dreams become real</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Without stress or awkward money talks
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
      
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={[styles.getStartedButton, { backgroundColor: theme.primary }]}
          onPress={handleGetStarted}
        >
          <ThemedText type="body" style={styles.buttonText}>
            Get Started
          </ThemedText>
          <Feather name="arrow-right" size={20} color="#FFFFFF" />
        </Pressable>
        
        <ThemedText type="tiny" style={[styles.privacyNote, { color: theme.textSecondary }]}>
          No bank linking needed - privacy-first design
        </ThemedText>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "60%",
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 24,
  },
  featuresSection: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  layerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  layerNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  layerContent: {
    flex: 1,
    gap: 2,
  },
  layerDivider: {
    width: 2,
    height: 16,
    marginLeft: 15,
    borderRadius: 1,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  getStartedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  privacyNote: {
    textAlign: "center",
  },
});
