import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Shadows } from "@/constants/theme";
import * as Haptics from "expo-haptics";

export type AIFeedbackType = "celebration" | "insight" | "warning" | "suggestion" | "learning";

export interface AIFeedback {
  id: string;
  type: AIFeedbackType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  autoDismissMs?: number;
}

interface AIFeedbackToastProps {
  feedback: AIFeedback | null;
  onDismiss: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function AIFeedbackToast({ feedback, onDismiss }: AIFeedbackToastProps) {
  const { theme: colors } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  const getTypeConfig = (type: AIFeedbackType) => {
    switch (type) {
      case "celebration":
        return {
          icon: "award" as const,
          color: colors.success,
          bgColor: colors.successLight,
          emoji: null,
        };
      case "insight":
        return {
          icon: "zap" as const,
          color: colors.aiPrimary,
          bgColor: colors.aiLight,
          emoji: null,
        };
      case "warning":
        return {
          icon: "alert-triangle" as const,
          color: colors.warning,
          bgColor: colors.warningLight,
          emoji: null,
        };
      case "suggestion":
        return {
          icon: "message-circle" as const,
          color: colors.accent,
          bgColor: colors.accentLight,
          emoji: null,
        };
      case "learning":
        return {
          icon: "cpu" as const,
          color: colors.aiPrimary,
          bgColor: colors.aiLight,
          emoji: null,
        };
      default:
        return {
          icon: "info" as const,
          color: colors.textSecondary,
          bgColor: colors.backgroundSecondary,
          emoji: null,
        };
    }
  };

  useEffect(() => {
    if (feedback) {
      setIsVisible(true);
      translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      
      if (feedback.type === "celebration") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (feedback.autoDismissMs) {
        const timer = setTimeout(() => {
          dismissToast();
        }, feedback.autoDismissMs);
        return () => clearTimeout(timer);
      }
    }
  }, [feedback]);

  const dismissToast = () => {
    translateY.value = withTiming(100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 });
    scale.value = withTiming(0.9, { duration: 200 }, () => {
      runOnJS(setIsVisible)(false);
      runOnJS(onDismiss)();
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  if (!feedback || !isVisible) return null;

  const config = getTypeConfig(feedback.type);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View
        style={[
          styles.toast,
          {
            backgroundColor: colors.backgroundDefault,
            borderColor: config.color + "30",
            ...Shadows.modal,
          },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
          <Feather name={config.icon} size={20} color={config.color} />
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={[styles.aiLabel, { backgroundColor: colors.aiLight }]}>
              <Feather name="cpu" size={10} color={colors.aiPrimary} />
              <ThemedText
                type="tiny"
                style={[styles.aiLabelText, { color: colors.aiPrimary }]}
              >
                AI
              </ThemedText>
            </View>
            <ThemedText
              type="small"
              style={[styles.title, { color: colors.text }]}
            >
              {feedback.title}
            </ThemedText>
          </View>

          <ThemedText
            type="caption"
            style={[styles.message, { color: colors.textSecondary }]}
            numberOfLines={3}
          >
            {feedback.message}
          </ThemedText>

          {feedback.actionLabel && feedback.onAction ? (
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: config.color }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  feedback.onAction?.();
                  dismissToast();
                }}
              >
                <ThemedText type="small" style={styles.actionButtonText}>
                  {feedback.actionLabel}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.dismissButton, { borderColor: colors.border }]}
                onPress={dismissToast}
              >
                <ThemedText
                  type="small"
                  style={[styles.dismissButtonText, { color: colors.textSecondary }]}
                >
                  Got it
                </ThemedText>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.dismissRow} onPress={dismissToast}>
              <ThemedText
                type="tiny"
                style={[styles.dismissText, { color: colors.textTertiary }]}
              >
                Tap to dismiss
              </ThemedText>
            </Pressable>
          )}
        </View>

        <Pressable
          style={styles.closeButton}
          onPress={dismissToast}
          hitSlop={10}
        >
          <Feather name="x" size={16} color={colors.textTertiary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  aiLabelText: {
    fontWeight: "700",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    fontWeight: "600",
    flex: 1,
  },
  message: {
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  actionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  dismissButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  dismissButtonText: {
    fontWeight: "500",
  },
  dismissRow: {
    marginTop: Spacing.xs,
  },
  dismissText: {
    fontStyle: "italic",
  },
  closeButton: {
    padding: Spacing.xs,
    marginLeft: -Spacing.xs,
    marginTop: -Spacing.xs,
  },
});

export default AIFeedbackToast;
