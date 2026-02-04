import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

interface Commitment {
  id: string;
  coupleId: string;
  patternId: string | null;
  nudgeId: string | null;
  category: string | null;
  merchant: string | null;
  budgetLimit: number;
  timeframe: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  timesChecked: number;
  timesKept: number;
  timesBroken: number;
  totalSaved: number;
  createdAt: string;
}

interface Props {
  coupleId: string;
  onRefresh?: () => void;
}

export function CommitmentsSection({ coupleId, onRefresh }: Props) {
  const { theme } = useTheme();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);
  const [newBudget, setNewBudget] = useState("");
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCommitments = useCallback(async () => {
    if (!coupleId) return;
    
    try {
      const response = await fetch(
        new URL(`/api/commitments/${coupleId}`, getApiUrl()).toString()
      );
      if (response.ok) {
        const data = await response.json();
        setCommitments(data.filter((c: Commitment) => c.isActive));
      }
    } catch (error) {
      console.error("Error fetching commitments:", error);
    } finally {
      setLoading(false);
    }
  }, [coupleId]);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  const handleEdit = (commitment: Commitment) => {
    setSelectedCommitment(commitment);
    setNewBudget(commitment.budgetLimit.toString());
    setRationale("");
    setEditModalVisible(true);
  };

  const handleDelete = (commitment: Commitment) => {
    setSelectedCommitment(commitment);
    setRationale("");
    setDeleteModalVisible(true);
  };

  const saveEdit = async () => {
    if (!selectedCommitment || !rationale.trim()) return;
    
    setSaving(true);
    try {
      await fetch(
        new URL(`/api/commitments/${selectedCommitment.id}`, getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            budgetLimit: parseFloat(newBudget),
            rationale: rationale.trim(),
          }),
        }
      );
      
      setEditModalVisible(false);
      fetchCommitments();
      onRefresh?.();
    } catch (error) {
      console.error("Error updating commitment:", error);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedCommitment || !rationale.trim()) return;
    
    setSaving(true);
    try {
      await fetch(
        new URL(`/api/commitments/${selectedCommitment.id}`, getApiUrl()).toString(),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rationale: rationale.trim(),
          }),
        }
      );
      
      setDeleteModalVisible(false);
      fetchCommitments();
      onRefresh?.();
    } catch (error) {
      console.error("Error deleting commitment:", error);
    } finally {
      setSaving(false);
    }
  };

  const getCommitmentLabel = (commitment: Commitment) => {
    if (commitment.merchant) {
      return commitment.merchant;
    }
    if (commitment.category) {
      return CATEGORY_LABELS[commitment.category] || commitment.category;
    }
    return "Spending";
  };

  const getCommitmentIcon = (commitment: Commitment): string => {
    if (commitment.category && CATEGORY_ICONS[commitment.category]) {
      return CATEGORY_ICONS[commitment.category];
    }
    return "heart";
  };

  const getCommitmentColor = (commitment: Commitment) => {
    if (commitment.category && CATEGORY_COLORS[commitment.category]) {
      return CATEGORY_COLORS[commitment.category];
    }
    return theme.primary;
  };

  const getSuccessRate = (commitment: Commitment) => {
    if (commitment.timesChecked === 0) return 100;
    return Math.round((commitment.timesKept / commitment.timesChecked) * 100);
  };

  if (loading) {
    return (
      <Card style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </Card>
    );
  }

  if (commitments.length === 0) {
    return null;
  }

  return (
    <>
      <Card style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="heart" size={18} color={theme.primary} />
          </View>
          <ThemedText type="heading">What Gets You There</ThemedText>
        </View>
        <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Your active commitments to reaching your dreams
        </ThemedText>

        {commitments.map((commitment) => {
          const successRate = getSuccessRate(commitment);
          const color = getCommitmentColor(commitment);
          
          return (
            <View 
              key={commitment.id} 
              style={[styles.commitmentCard, { backgroundColor: theme.backgroundSecondary }]}
            >
              <View style={styles.commitmentHeader}>
                <View style={[styles.commitmentIcon, { backgroundColor: color + "20" }]}>
                  <Feather 
                    name={getCommitmentIcon(commitment) as any} 
                    size={16} 
                    color={color} 
                  />
                </View>
                <View style={styles.commitmentInfo}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    {getCommitmentLabel(commitment)}
                  </ThemedText>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    ${commitment.budgetLimit}/{commitment.timeframe}
                  </ThemedText>
                </View>
                <View style={styles.commitmentActions}>
                  <Pressable 
                    style={styles.actionButton}
                    onPress={() => handleEdit(commitment)}
                    hitSlop={8}
                  >
                    <Feather name="edit-2" size={14} color={theme.textSecondary} />
                  </Pressable>
                  <Pressable 
                    style={styles.actionButton}
                    onPress={() => handleDelete(commitment)}
                    hitSlop={8}
                  >
                    <Feather name="trash-2" size={14} color={theme.error} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    Success
                  </ThemedText>
                  <ThemedText 
                    type="small" 
                    style={{ 
                      fontWeight: "700",
                      color: successRate >= 80 ? theme.success : 
                             successRate >= 50 ? theme.warning : theme.error 
                    }}
                  >
                    {successRate}%
                  </ThemedText>
                </View>
                <View style={styles.stat}>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    Saved
                  </ThemedText>
                  <ThemedText type="small" style={{ fontWeight: "700", color: theme.success }}>
                    ${commitment.totalSaved.toFixed(0)}
                  </ThemedText>
                </View>
                <View style={styles.stat}>
                  <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                    Streak
                  </ThemedText>
                  <ThemedText type="small" style={{ fontWeight: "700" }}>
                    {commitment.timesKept}x
                  </ThemedText>
                </View>
              </View>
            </View>
          );
        })}
      </Card>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="heading">Edit Commitment</ThemedText>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              Adjusting your commitment? Help us learn what works for you.
            </ThemedText>

            <ThemedText type="body" style={{ marginBottom: Spacing.xs }}>
              New Budget Limit
            </ThemedText>
            <View style={[styles.inputContainer, { borderColor: theme.border }]}>
              <ThemedText type="body">$</ThemedText>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={newBudget}
                onChangeText={setNewBudget}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
              />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                /{selectedCommitment?.timeframe || "week"}
              </ThemedText>
            </View>

            <ThemedText type="body" style={{ marginTop: Spacing.md, marginBottom: Spacing.xs }}>
              Why are you making this change?
            </ThemedText>
            <TextInput
              style={[
                styles.rationaleInput, 
                { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border }
              ]}
              value={rationale}
              onChangeText={setRationale}
              placeholder="e.g., The original limit was too tight..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
              This helps your Guardian AI learn and give better suggestions
            </ThemedText>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.backgroundRoot }]}
                onPress={() => setEditModalVisible(false)}
              >
                <ThemedText type="body">Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton, 
                  { 
                    backgroundColor: rationale.trim() ? theme.primary : theme.border,
                    opacity: rationale.trim() ? 1 : 0.5,
                  }
                ]}
                onPress={saveEdit}
                disabled={!rationale.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                    Save Changes
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="heading">Remove Commitment</ThemedText>
              <Pressable onPress={() => setDeleteModalVisible(false)}>
                <Feather name="x" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
              Removing this commitment will stop tracking. Help us understand why.
            </ThemedText>

            <ThemedText type="body" style={{ marginBottom: Spacing.xs }}>
              Why are you removing this commitment?
            </ThemedText>
            <TextInput
              style={[
                styles.rationaleInput, 
                { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border }
              ]}
              value={rationale}
              onChangeText={setRationale}
              placeholder="e.g., I already achieved my goal..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <ThemedText type="tiny" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
              This feedback trains your Guardian AI to give smarter suggestions
            </ThemedText>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.backgroundRoot }]}
                onPress={() => setDeleteModalVisible(false)}
              >
                <ThemedText type="body">Keep It</ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton, 
                  { 
                    backgroundColor: rationale.trim() ? theme.error : theme.border,
                    opacity: rationale.trim() ? 1 : 0.5,
                  }
                ]}
                onPress={confirmDelete}
                disabled={!rationale.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText type="body" style={{ color: "#FFFFFF" }}>
                    Remove
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    marginBottom: Spacing.md,
  },
  commitmentCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  commitmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  commitmentIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  commitmentInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  commitmentActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  stat: {
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  inputContainer: {
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
  rationaleInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 80,
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
