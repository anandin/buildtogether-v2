import React from "react";
import { View, StyleSheet, ScrollView, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

export default function ExpenseDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { data, deleteExpense } = useApp();

  const expenseId = route.params?.expenseId;
  const expense = data?.expenses.find((e) => e.id === expenseId);

  if (!expense) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ThemedText type="body">Expense not found</ThemedText>
      </View>
    );
  }

  const categoryIcon = CATEGORY_ICONS[expense.category] as any;
  const categoryColor = CATEGORY_COLORS[expense.category];
  const categoryLabel = CATEGORY_LABELS[expense.category];

  const partner1Share = expense.splitAmounts?.partner1 ?? expense.amount / 2;
  const partner2Share = expense.splitAmounts?.partner2 ?? expense.amount / 2;

  const handleDelete = async () => {
    await deleteExpense(expense.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  };

  const handleEdit = () => {
    navigation.navigate("AddExpense", {
      prefilled: {
        amount: expense.amount,
        description: expense.description,
        category: expense.category,
      },
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.categoryIcon, { backgroundColor: categoryColor + "20" }]}>
            <Feather name={categoryIcon} size={24} color={categoryColor} />
          </View>
          <ThemedText type="h3" style={styles.title}>
            {categoryLabel}
          </ThemedText>
          <ThemedText type="h3" style={{ color: theme.text }}>
            ${expense.amount.toFixed(2)}
          </ThemedText>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: expense.isSettled ? theme.success + "20" : theme.warning + "20" }]}>
            <ThemedText
              type="tiny"
              style={{ color: expense.isSettled ? theme.success : theme.warning }}
            >
              {expense.splitMethod === "even" ? "Even" : expense.splitMethod}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {format(new Date(expense.date), "EEE, MM-dd")}
          </ThemedText>
          <View style={[styles.badge, { backgroundColor: expense.isSettled ? theme.success + "20" : theme.accent + "20" }]}>
            <ThemedText
              type="tiny"
              style={{ color: expense.isSettled ? theme.success : theme.accent }}
            >
              {expense.isSettled ? "Settled" : "Pending"}
            </ThemedText>
          </View>
        </View>
      </View>

      <Card style={styles.noteCard}>
        <ThemedText type="body">
          {expense.note || expense.description}
        </ThemedText>
      </Card>

      <View style={styles.splitSection}>
        <View style={styles.splitHeader}>
          <View style={styles.splitHeaderCell} />
          <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "center" }}>
            Split
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "center" }}>
            Temp Cover
          </ThemedText>
        </View>

        <View style={styles.splitRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner1.color || theme.primary }]}>
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner1.name?.charAt(0) || "Y"}
              </ThemedText>
            </View>
            <ThemedText type="body">{data?.partners.partner1.name || "You"}</ThemedText>
          </View>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            ${partner1Share.toFixed(2)}
          </ThemedText>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            {expense.paidBy === "partner1" ? `$${expense.amount.toFixed(2)}` : "$0"}
          </ThemedText>
        </View>

        <View style={styles.splitRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.partnerAvatar, { backgroundColor: data?.partners.partner2.color || theme.accent }]}>
              <ThemedText type="small" style={{ color: "#FFFFFF" }}>
                {data?.partners.partner2.name?.charAt(0) || "P"}
              </ThemedText>
            </View>
            <ThemedText type="body">{data?.partners.partner2.name || "Partner"}</ThemedText>
          </View>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            ${partner2Share.toFixed(2)}
          </ThemedText>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            {expense.paidBy === "partner2" ? `$${expense.amount.toFixed(2)}` : "$0"}
          </ThemedText>
        </View>

        <View style={styles.splitRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.partnerAvatar, { backgroundColor: theme.success }]}>
              <Feather name="users" size={14} color="#FFFFFF" />
            </View>
            <ThemedText type="body">Joint Account</ThemedText>
          </View>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            $0
          </ThemedText>
          <ThemedText type="body" style={{ flex: 1, textAlign: "center" }}>
            {expense.paidBy === "joint" ? `$${expense.amount.toFixed(2)}` : "$0"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={handleDelete} style={styles.actionButton}>
          <Feather name="trash-2" size={20} color={theme.textSecondary} />
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Feather name="refresh-cw" size={20} color={theme.textSecondary} />
        </Pressable>
        <Pressable style={[styles.viewReceiptButton, { borderColor: theme.primary }]}>
          <ThemedText type="body" style={{ color: theme.primary }}>
            View receipt
          </ThemedText>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Feather name="copy" size={20} color={theme.textSecondary} />
        </Pressable>
        <Pressable onPress={handleEdit} style={styles.actionButton}>
          <Feather name="edit-2" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.messageSection}>
        <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
          No Message
        </ThemedText>
      </View>

      <View style={[styles.messageInput, { backgroundColor: theme.backgroundDefault }]}>
        <Pressable style={styles.messageIcon}>
          <Feather name="camera" size={20} color={theme.textSecondary} />
        </Pressable>
        <Pressable style={styles.messageIcon}>
          <Feather name="smile" size={20} color={theme.textSecondary} />
        </Pressable>
        <TextInputPlaceholder theme={theme} />
        <ThemedText type="body" style={{ color: theme.primary }}>
          Send
        </ThemedText>
      </View>
    </ScrollView>
  );
}

function TextInputPlaceholder({ theme }: { theme: any }) {
  return (
    <View style={styles.messageInputField}>
      <ThemedText type="body" style={{ color: theme.textSecondary }}>
        Input your message
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginBottom: Spacing.xl,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  noteCard: {
    marginBottom: Spacing.xl,
  },
  splitSection: {
    marginBottom: Spacing.xl,
  },
  splitHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  splitHeaderCell: {
    flex: 2,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  partnerInfo: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  partnerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
    marginBottom: Spacing.xl,
  },
  actionButton: {
    padding: Spacing.sm,
  },
  viewReceiptButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  messageSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
  },
  messageInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.md,
  },
  messageIcon: {
    padding: Spacing.xs,
  },
  messageInputField: {
    flex: 1,
  },
});
