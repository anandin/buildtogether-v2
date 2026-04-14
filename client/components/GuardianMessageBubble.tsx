import React from "react";
import { View, StyleSheet, Image, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { GuardianMessage } from "@/hooks/useGuardianChat";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

interface Props {
  message: GuardianMessage;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onEdit?: () => void;
  onUndo?: (expenseId: string) => void;
}

export function GuardianMessageBubble({ message, onConfirm, onDismiss, onEdit, onUndo }: Props) {
  const { theme } = useTheme();

  if (message.role === "user") {
    return (
      <View style={[styles.userBubble, { backgroundColor: theme.primary + "15" }]}>
        <ThemedText style={[styles.userText, { color: theme.text }]}>
          {message.content}
        </ThemedText>
      </View>
    );
  }

  const typeColors: Record<string, { bg: string; border: string; icon: string }> = {
    greeting: { bg: theme.aiLight, border: theme.aiPrimary + "30", icon: theme.aiPrimary },
    confirmation: { bg: theme.primaryLight, border: theme.primary + "30", icon: theme.primary },
    celebration: { bg: theme.successLight, border: theme.success + "30", icon: theme.success },
    nudge: { bg: theme.warningLight, border: theme.warning + "30", icon: theme.warning },
    alert: { bg: theme.warningLight, border: theme.warning + "40", icon: theme.warning },
    error: { bg: theme.errorLight, border: theme.error + "30", icon: theme.error },
  };

  const colors = typeColors[message.type || "greeting"] || typeColors.greeting;
  const showActions = message.type === "confirmation" && message.parsedExpense;

  return (
    <View style={[styles.guardianRow]}>
      <Image source={dreamGuardianIcon} style={styles.avatar} />
      <View style={[styles.guardianBubble, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <ThemedText style={[styles.guardianText, { color: theme.text }]}>
          {message.content}
        </ThemedText>

        {message.budgetAlert && message.type !== "confirmation" && (
          <View style={[styles.alertBadge, { backgroundColor: theme.warningLight }]}>
            <Feather name="alert-circle" size={14} color={theme.warning} />
            <ThemedText style={[styles.alertText, { color: theme.warningDark }]}>
              {message.budgetAlert}
            </ThemedText>
          </View>
        )}

        {message.autoSaved && message.savedExpense && onUndo && (
          <Pressable
            style={[styles.undoButton, { backgroundColor: theme.surface }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onUndo(message.savedExpense.id);
            }}
          >
            <Feather name="rotate-ccw" size={14} color={theme.textSecondary} />
            <ThemedText style={[styles.undoText, { color: theme.textSecondary }]}>
              Undo
            </ThemedText>
          </Pressable>
        )}

        {showActions && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: theme.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onConfirm?.();
              }}
            >
              <Feather name="check" size={16} color="#FFFFFF" />
              <ThemedText style={styles.actionTextPrimary}>Save</ThemedText>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.secondaryAction, { borderColor: theme.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onEdit?.();
              }}
            >
              <Feather name="edit-2" size={14} color={theme.textSecondary} />
              <ThemedText style={[styles.actionTextSecondary, { color: theme.textSecondary }]}>
                Edit
              </ThemedText>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.secondaryAction, { borderColor: theme.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDismiss?.();
              }}
            >
              <Feather name="x" size={14} color={theme.textTertiary} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "80%",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  userText: {
    fontSize: 15,
  },
  guardianRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginTop: 2,
  },
  guardianBubble: {
    flex: 1,
    maxWidth: "85%",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  guardianText: {
    fontSize: 15,
    lineHeight: 22,
  },
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  alertText: {
    fontSize: 13,
    flex: 1,
  },
  undoButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  undoText: {
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  secondaryAction: {
    borderWidth: 1,
  },
  actionTextPrimary: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  actionTextSecondary: {
    fontSize: 14,
  },
});
