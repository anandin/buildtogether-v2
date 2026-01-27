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
            The couples finance app that makes{"\n"}money conversations easy
          </ThemedText>
        </View>
        
        <View style={styles.featuresSection}>
          <FeatureItem 
            icon="pie-chart" 
            title="Share expenses fairly"
            description="Split bills your way - equal, by income, or custom"
            color={theme.primary}
            theme={theme}
          />
          <FeatureItem 
            icon="target" 
            title="Dream together"
            description="Save toward shared goals like vacations or a home"
            color={theme.success}
            theme={theme}
          />
          <FeatureItem 
            icon="sun" 
            title="Your Dream Guardian"
            description="A friendly ally helping you stay on track"
            color={theme.warning}
            theme={theme}
          />
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
          Your financial data stays on your device
        </ThemedText>
      </View>
    </View>
  );
}

function FeatureItem({ 
  icon, 
  title, 
  description, 
  color,
  theme 
}: { 
  icon: string; 
  title: string; 
  description: string; 
  color: string;
  theme: any;
}) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.featureText}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {description}
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
    gap: Spacing.lg,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  featureText: {
    flex: 1,
    gap: 2,
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
