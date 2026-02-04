import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

const COUPLE_ID_KEY = "@couple_id";

interface LineItem {
  id: string;
  name: string;
  quantity: number;
  totalPrice: number;
  classification: string;
  isEssential: boolean;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  staple: "#10B981",
  household: "#6366F1",
  beverage: "#3B82F6",
  treat: "#F59E0B",
  prepared: "#8B5CF6",
  luxury: "#EC4899",
  kids: "#14B8A6",
  other: "#6B7280",
};

const CLASSIFICATION_ICONS: Record<string, string> = {
  staple: "check-circle",
  household: "home",
  beverage: "coffee",
  treat: "star",
  prepared: "package",
  luxury: "award",
  kids: "heart",
  other: "circle",
};

export default function ExpenseDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { theme } = useTheme();
  const { data, deleteExpense } = useApp();
  
  const [lineItemsData, setLineItemsData] = useState<LineItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const expenseId = route.params?.expenseId;
  const expense = data?.expenses.find((e) => e.id === expenseId);

  useEffect(() => {
    const fetchLineItems = async () => {
      if (!expenseId) return;
      setLoadingItems(true);
      try {
        const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
        if (coupleId) {
          const response = await apiRequest("GET", `/api/expenses/${coupleId}/${expenseId}/line-items`);
          const items = await response.json();
          setLineItemsData(items);
        }
      } catch (err) {
        console.error("Failed to fetch line items:", err);
      } finally {
        setLoadingItems(false);
      }
    };
    fetchLineItems();
  }, [expenseId]);

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

      {(loadingItems || lineItemsData.length > 0) ? (
        <Card style={styles.lineItemsCard}>
          <View style={styles.lineItemsHeader}>
            <Feather name="list" size={18} color={theme.primary} />
            <ThemedText type="body" style={{ fontWeight: "600", marginLeft: Spacing.sm }}>
              Items Breakdown
            </ThemedText>
          </View>
          
          {loadingItems ? (
            <ActivityIndicator size="small" color={theme.primary} style={{ padding: Spacing.lg }} />
          ) : (
            <>
              {lineItemsData.map((item, index) => {
                const itemColor = CLASSIFICATION_COLORS[item.classification] || CLASSIFICATION_COLORS.other;
                const itemIcon = CLASSIFICATION_ICONS[item.classification] || CLASSIFICATION_ICONS.other;
                return (
                  <View key={item.id || index} style={styles.lineItemRow}>
                    <View style={[styles.lineItemIcon, { backgroundColor: itemColor + "20" }]}>
                      <Feather name={itemIcon as any} size={14} color={itemColor} />
                    </View>
                    <View style={styles.lineItemInfo}>
                      <ThemedText type="small" numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      <View style={styles.lineItemMeta}>
                        <View style={[styles.classificationBadge, { backgroundColor: itemColor + "15" }]}>
                          <ThemedText type="tiny" style={{ color: itemColor, textTransform: "capitalize" }}>
                            {item.classification}
                          </ThemedText>
                        </View>
                        {item.quantity > 1 ? (
                          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                            x{item.quantity}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>
                    <ThemedText type="small" style={{ fontWeight: "600" }}>
                      ${item.totalPrice.toFixed(2)}
                    </ThemedText>
                  </View>
                );
              })}
              
              <View style={[styles.lineItemsSummary, { borderTopColor: theme.border }]}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <ThemedText type="tiny" style={{ color: theme.textSecondary }}>Essentials</ThemedText>
                    <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600" }}>
                      ${lineItemsData.filter(i => i.isEssential).reduce((s, i) => s + i.totalPrice, 0).toFixed(2)}
                    </ThemedText>
                  </View>
                  <View style={styles.summaryItem}>
                    <ThemedText type="tiny" style={{ color: theme.textSecondary }}>Treats/Extras</ThemedText>
                    <ThemedText type="small" style={{ color: "#F59E0B", fontWeight: "600" }}>
                      ${lineItemsData.filter(i => !i.isEssential).reduce((s, i) => s + i.totalPrice, 0).toFixed(2)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </>
          )}
        </Card>
      ) : null}

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

      <View style={styles.actionsSection}>
        <ThemedText type="small" style={[styles.actionsTitle, { color: theme.textSecondary }]}>
          Actions
        </ThemedText>
        <View style={styles.actionsGrid}>
          <Pressable onPress={handleEdit} style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.actionIconContainer, { backgroundColor: theme.primary + "20" }]}>
              <Feather name="edit-2" size={20} color={theme.primary} />
            </View>
            <ThemedText type="small">Edit</ThemedText>
          </Pressable>
          
          <Pressable 
            onPress={() => navigation.navigate("ReclassifyExpense" as any, { expenseId: expense.id })} 
            style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: theme.accent + "20" }]}>
              <Feather name="tag" size={20} color={theme.accent} />
            </View>
            <ThemedText type="small">Reclassify</ThemedText>
          </Pressable>
          
          <Pressable 
            style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => {}}
          >
            <View style={[styles.actionIconContainer, { backgroundColor: theme.success + "20" }]}>
              <Feather name="copy" size={20} color={theme.success} />
            </View>
            <ThemedText type="small">Duplicate</ThemedText>
          </Pressable>
          
          <Pressable onPress={handleDelete} style={[styles.actionCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.actionIconContainer, { backgroundColor: theme.error + "20" }]}>
              <Feather name="trash-2" size={20} color={theme.error} />
            </View>
            <ThemedText type="small">Delete</ThemedText>
          </Pressable>
        </View>
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
  lineItemsCard: {
    marginBottom: Spacing.xl,
  },
  lineItemsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  lineItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  lineItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  lineItemInfo: {
    flex: 1,
    gap: 2,
  },
  lineItemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  classificationBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.xs,
  },
  lineItemsSummary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    gap: 2,
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
  actionsSection: {
    marginBottom: Spacing.xl,
  },
  actionsTitle: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  actionCard: {
    width: "47%",
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  actionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
