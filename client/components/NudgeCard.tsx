import React, { useState } from "react";
import { View, Pressable, StyleSheet, Modal, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface Nudge {
  id: string;
  title: string;
  message: string;
  suggestedAction: string | null;
  targetAmount: number | null;
  category: string | null;
  rationale: string | null;
  behavioralTechnique: string | null;
  evidenceData?: {
    patternId?: string;
    merchant?: string;
    potentialSavings?: number;
  };
}

interface NudgeCardProps {
  nudge: Nudge;
  coupleId: string;
  onAccept: (nudge: Nudge) => void;
  onDismiss: (nudge: Nudge) => void;
  onCommitmentCreated?: () => void;
}

export function NudgeCard({ nudge, coupleId, onAccept, onDismiss, onCommitmentCreated }: NudgeCardProps) {
  const { theme } = useTheme();
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitmentAmount, setCommitmentAmount] = useState(
    nudge.targetAmount?.toString() || "50"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRationale, setShowRationale] = useState(false);

  const handleAccept = () => {
    setShowCommitModal(true);
  };

  const handleCreateCommitment = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(new URL("/api/commitments", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId,
          title: nudge.suggestedAction || `Budget for ${nudge.category || "spending"}`,
          description: nudge.message,
          commitmentType: "budget_limit",
          category: nudge.category,
          merchant: nudge.evidenceData?.merchant,
          targetAmount: parseFloat(commitmentAmount),
          currentAmount: nudge.targetAmount,
          sourceNudgeId: nudge.id,
          sourcePatternId: nudge.evidenceData?.patternId,
        }),
      });

      if (response.ok) {
        setShowCommitModal(false);
        onAccept(nudge);
        onCommitmentCreated?.();
      }
    } catch (error) {
      console.error("Error creating commitment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch(new URL(`/api/nudges/${nudge.id}/respond`, getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: "dismissed" }),
      });
      onDismiss(nudge);
    } catch (error) {
      console.error("Error dismissing nudge:", error);
      onDismiss(nudge);
    }
  };

  const techniqueIcon = nudge.behavioralTechnique === "loss_aversion" ? "alert-triangle" 
    : nudge.behavioralTechnique === "progress_framing" ? "trending-up"
    : "users";

  const savingsAmount = nudge.evidenceData?.potentialSavings || nudge.targetAmount || 0;

  return (
    <>
      <Animated.View entering={SlideInRight} exiting={SlideOutLeft}>
        <Card style={styles.container}>
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
              <Feather name="zap" size={20} color={theme.primary} />
            </View>
            <View style={styles.headerText}>
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>
                GUARDIAN INSIGHT
              </ThemedText>
              <ThemedText type="heading" numberOfLines={2}>
                {nudge.title}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="body" style={[styles.message, { color: theme.text }]}>
            {nudge.message}
          </ThemedText>

          {savingsAmount > 0 ? (
            <View style={[styles.savingsHighlight, { backgroundColor: "#10B981" + "15" }]}>
              <Feather name="dollar-sign" size={16} color="#10B981" />
              <ThemedText type="body" style={{ color: "#10B981", fontWeight: "600" }}>
                Save up to ${savingsAmount.toFixed(0)}/month
              </ThemedText>
            </View>
          ) : null}

          {nudge.rationale ? (
            <Pressable 
              style={styles.rationaleToggle}
              onPress={() => setShowRationale(!showRationale)}
            >
              <Feather 
                name={showRationale ? "chevron-up" : "chevron-down"} 
                size={14} 
                color={theme.textSecondary} 
              />
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                {showRationale ? "Hide" : "Why this recommendation?"}
              </ThemedText>
            </Pressable>
          ) : null}

          {showRationale && nudge.rationale ? (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <View style={[styles.rationaleBox, { backgroundColor: theme.backgroundRoot }]}>
                <Feather name={techniqueIcon as any} size={14} color={theme.textSecondary} />
                <ThemedText type="tiny" style={{ color: theme.textSecondary, flex: 1 }}>
                  {nudge.rationale}
                </ThemedText>
              </View>
            </Animated.View>
          ) : null}

          <View style={styles.actions}>
            <Pressable 
              style={[styles.actionButton, styles.dismissButton, { borderColor: theme.border }]}
              onPress={handleDismiss}
            >
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                Not Now
              </ThemedText>
            </Pressable>
            <Pressable 
              style={[styles.actionButton, styles.acceptButton, { backgroundColor: theme.primary }]}
              onPress={handleAccept}
            >
              <Feather name="check" size={16} color="#FFF" />
              <ThemedText type="body" style={{ color: "#FFF", fontWeight: "600" }}>
                I Commit
              </ThemedText>
            </Pressable>
          </View>
        </Card>
      </Animated.View>

      <Modal
        visible={showCommitModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCommitModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowCommitModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.modalHandle} />
            
            <View style={styles.commitHeader}>
              <View style={[styles.commitIcon, { backgroundColor: theme.primary + "20" }]}>
                <Feather name="heart" size={24} color={theme.primary} />
              </View>
              <ThemedText type="heading" style={{ textAlign: "center" }}>
                Make It Official
              </ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Set your budget and we'll help you stick to it
              </ThemedText>
            </View>

            <View style={styles.inputSection}>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
                {nudge.category ? `Weekly ${nudge.category} budget` : "Weekly budget limit"}
              </ThemedText>
              <View style={[styles.amountInput, { borderColor: theme.primary, backgroundColor: theme.backgroundRoot }]}>
                <ThemedText type="heading" style={{ color: theme.textSecondary }}>$</ThemedText>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={commitmentAmount}
                  onChangeText={setCommitmentAmount}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={theme.textSecondary}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>/week</ThemedText>
              </View>
            </View>

            <View style={[styles.commitmentPreview, { backgroundColor: theme.backgroundRoot }]}>
              <Feather name="target" size={16} color={theme.primary} />
              <ThemedText type="small" style={{ flex: 1 }}>
                Your commitment: Spend no more than ${commitmentAmount}/week on {nudge.category || "this category"}
              </ThemedText>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, { borderColor: theme.border }]}
                onPress={() => setShowCommitModal(false)}
              >
                <ThemedText type="body">Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.primaryButton, { backgroundColor: theme.primary }]}
                onPress={handleCreateCommitment}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Feather name="check-circle" size={16} color="#FFF" />
                    <ThemedText type="body" style={{ color: "#FFF", fontWeight: "600" }}>
                      Commit
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: Spacing.xs,
  },
  message: {
    marginBottom: Spacing.md,
    lineHeight: 22,
  },
  savingsHighlight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  rationaleToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  rationaleBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  dismissButton: {
    borderWidth: 1,
  },
  acceptButton: {},
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#CCC",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  commitHeader: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  commitIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  inputSection: {
    marginBottom: Spacing.lg,
  },
  amountInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    padding: 0,
  },
  commitmentPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
});
