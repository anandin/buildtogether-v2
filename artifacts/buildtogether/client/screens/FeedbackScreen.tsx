import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, queryClient } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

const COUPLE_ID_KEY = "@couple_id";

type FeedbackType = "feedback" | "issue" | "idea";

const feedbackTypes: { key: FeedbackType; label: string; icon: string; color: string }[] = [
  { key: "feedback", label: "Feedback", icon: "message-circle", color: "#7C3AED" },
  { key: "issue", label: "Issue", icon: "alert-circle", color: "#DC2626" },
  { key: "idea", label: "Idea", icon: "zap", color: "#F97316" },
];

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  new: { label: "New", color: "#7C3AED", icon: "clock" },
  reviewed: { label: "Reviewed", color: "#D97706", icon: "eye" },
  resolved: { label: "Resolved", color: "#059669", icon: "check-circle" },
};

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [selectedType, setSelectedType] = useState<FeedbackType>("feedback");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const feedbackUrl = user?.coupleId ? `/api/feedback/${user.coupleId}` : null;
  const { data: submissions = [], isLoading: loadingSubmissions } = useQuery<any[]>({
    queryKey: [feedbackUrl],
    enabled: !!feedbackUrl,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
      await apiRequest("POST", "/api/feedback", {
        coupleId: coupleId || undefined,
        userId: user?.id || undefined,
        type: selectedType,
        title: title.trim(),
        description: description.trim(),
        platform: Platform.OS,
        appVersion: "1.0.0",
      });
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setShowSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (feedbackUrl) {
        queryClient.invalidateQueries({ queryKey: [feedbackUrl] });
      }
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitMutation.isPending;

  const renderSubmission = ({ item }: { item: any }) => {
    const status = statusConfig[item.status] || statusConfig.new;
    const typeInfo = feedbackTypes.find((t) => t.key === item.type) || feedbackTypes[0];
    const date = new Date(item.createdAt).toLocaleDateString();

    return (
      <View style={[styles.submissionItem, { borderBottomColor: theme.border }]}>
        <View style={styles.submissionHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeInfo.color + "15" }]}>
            <Feather name={typeInfo.icon as any} size={12} color={typeInfo.color} />
            <ThemedText type="tiny" style={{ color: typeInfo.color, fontWeight: "600" }}>
              {typeInfo.label}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + "15" }]}>
            <Feather name={status.icon as any} size={10} color={status.color} />
            <ThemedText type="tiny" style={{ color: status.color, fontWeight: "600" }}>
              {status.label}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="body" style={{ fontWeight: "600", marginTop: Spacing.xs }}>
          {item.title}
        </ThemedText>
        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginTop: 2 }}
          numberOfLines={2}
        >
          {item.description}
        </ThemedText>
        <ThemedText type="tiny" style={{ color: theme.textTertiary, marginTop: Spacing.xs }}>
          {date}
        </ThemedText>
      </View>
    );
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      {showSuccess ? (
        <Card style={styles.successCard}>
          <View style={[styles.successIcon, { backgroundColor: theme.success + "15" }]}>
            <Feather name="check-circle" size={32} color={theme.success} />
          </View>
          <ThemedText type="heading" style={{ textAlign: "center", marginTop: Spacing.md }}>
            Thank you!
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.xs }}
          >
            Your {selectedType} has been submitted. We appreciate you helping us improve!
          </ThemedText>
        </Card>
      ) : null}

      <Card style={styles.formCard}>
        <ThemedText type="heading" style={styles.sectionTitle}>
          What would you like to share?
        </ThemedText>

        <View style={styles.typeSelector}>
          {feedbackTypes.map((type) => {
            const isSelected = selectedType === type.key;
            return (
              <Pressable
                key={type.key}
                testID={`button-type-${type.key}`}
                style={[
                  styles.typePill,
                  {
                    backgroundColor: isSelected ? type.color + "20" : theme.backgroundSecondary,
                    borderColor: isSelected ? type.color : "transparent",
                  },
                ]}
                onPress={() => {
                  setSelectedType(type.key);
                  Haptics.selectionAsync();
                }}
              >
                <Feather
                  name={type.icon as any}
                  size={16}
                  color={isSelected ? type.color : theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  style={{
                    color: isSelected ? type.color : theme.textSecondary,
                    fontWeight: isSelected ? "600" : "400",
                  }}
                >
                  {type.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
          Title
        </ThemedText>
        <TextInput
          testID="input-title"
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundSecondary,
              borderColor: theme.border,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="Brief summary"
          placeholderTextColor={theme.textTertiary}
          maxLength={100}
        />

        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md }}
        >
          Description
        </ThemedText>
        <TextInput
          testID="input-description"
          style={[
            styles.textArea,
            {
              color: theme.text,
              backgroundColor: theme.backgroundSecondary,
              borderColor: theme.border,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Tell us more..."
          placeholderTextColor={theme.textTertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={1000}
        />

        <Button
          onPress={() => submitMutation.mutate()}
          disabled={!canSubmit}
          style={styles.submitButton}
        >
          {submitMutation.isPending ? "Submitting..." : "Submit"}
        </Button>

        {submitMutation.isError ? (
          <ThemedText
            type="small"
            style={{ color: theme.error, textAlign: "center", marginTop: Spacing.sm }}
          >
            Failed to submit. Please try again.
          </ThemedText>
        ) : null}
      </Card>

      {user?.coupleId ? (
        <Card style={styles.historyCard}>
          <ThemedText type="heading" style={styles.sectionTitle}>
            Your Submissions
          </ThemedText>

          {loadingSubmissions ? (
            <ActivityIndicator
              color={theme.primary}
              style={{ paddingVertical: Spacing.xl }}
            />
          ) : submissions.length > 0 ? (
            submissions.map((item: any) => (
              <View key={item.id}>{renderSubmission({ item })}</View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Feather name="inbox" size={32} color={theme.textTertiary} />
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, marginTop: Spacing.sm, textAlign: "center" }}
              >
                No submissions yet. Share your thoughts with us!
              </ThemedText>
            </View>
          )}
        </Card>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  formCard: {
    marginBottom: Spacing.lg,
  },
  historyCard: {
    marginBottom: Spacing.lg,
  },
  successCard: {
    marginBottom: Spacing.lg,
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  typePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    fontSize: 16,
  },
  textArea: {
    minHeight: 120,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    fontSize: 16,
  },
  submitButton: {
    marginTop: Spacing.lg,
  },
  submissionItem: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  submissionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
});
