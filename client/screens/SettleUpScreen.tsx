import React, { useState, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getUnsettledExpenses, calculateOwedAmounts } from "@/lib/storage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/types";

type TabType = "unsettled" | "records";

export default function SettleUpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, settleExpenses } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>("unsettled");

  const unsettledExpenses = useMemo(() => {
    return data ? getUnsettledExpenses(data.expenses) : [];
  }, [data]);

  const owedAmounts = useMemo(() => {
    return data ? calculateOwedAmounts(data.expenses, data.partners) : { partner1Owes: 0, partner2Owes: 0 };
  }, [data]);

  const netOwed = owedAmounts.partner1Owes - owedAmounts.partner2Owes;
  const whoOwes = netOwed > 0 ? "partner1" : "partner2";
  const whoGets = netOwed > 0 ? "partner2" : "partner1";
  const absOwed = Math.abs(netOwed);

  const handleSettleAll = async () => {
    if (unsettledExpenses.length === 0) return;
    
    const expenseIds = unsettledExpenses.map((e) => e.id);
    await settleExpenses(expenseIds, whoOwes, whoGets, absOwed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  };

  const renderUnsettledItem = ({ item }: any) => {
    const categoryIcon = CATEGORY_ICONS[item.category] as any;
    const categoryColor = CATEGORY_COLORS[item.category];

    return (
      <Pressable
        style={[styles.expenseItem, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => navigation.navigate("ExpenseDetail", { expenseId: item.id })}
      >
        <View style={[styles.categoryIcon, { backgroundColor: categoryColor + "20" }]}>
          <Feather name={categoryIcon} size={18} color={categoryColor} />
        </View>
        <View style={styles.expenseInfo}>
          <ThemedText type="body" numberOfLines={1}>
            {item.description}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {format(new Date(item.date), "MMM d")} • {data?.partners[item.paidBy]?.name}
          </ThemedText>
        </View>
        <ThemedText type="heading">${item.amount.toFixed(2)}</ThemedText>
      </Pressable>
    );
  };

  const renderRecordItem = ({ item }: any) => (
    <View style={[styles.recordItem, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.recordInfo}>
        <ThemedText type="body">
          {data?.partners[item.from]?.name} paid {data?.partners[item.to]?.name}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {format(new Date(item.date), "MMM d, yyyy")}
        </ThemedText>
      </View>
      <ThemedText type="heading" style={{ color: theme.success }}>
        ${item.amount.toFixed(2)}
      </ThemedText>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
          <Feather name="chevron-down" size={28} color="#FFFFFF" />
        </Pressable>
        <ThemedText type="h4" style={styles.headerTitle}>
          Settle Up
        </ThemedText>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[
            styles.tab,
            activeTab === "unsettled" && styles.activeTab,
            activeTab === "unsettled" && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab("unsettled")}
        >
          <ThemedText
            type="body"
            style={{ color: activeTab === "unsettled" ? theme.primary : theme.textSecondary }}
          >
            Unsettled List
          </ThemedText>
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            activeTab === "records" && styles.activeTab,
            activeTab === "records" && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab("records")}
        >
          <ThemedText
            type="body"
            style={{ color: activeTab === "records" ? theme.primary : theme.textSecondary }}
          >
            Records
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.content}>
        {activeTab === "unsettled" ? (
          unsettledExpenses.length > 0 ? (
            <FlatList
              data={unsettledExpenses}
              keyExtractor={(item) => item.id}
              renderItem={renderUnsettledItem}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <View style={styles.emptyState}>
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                No unsettled expenses
              </ThemedText>
            </View>
          )
        ) : (
          <FlatList
            data={data?.settlements || []}
            keyExtractor={(item) => item.id}
            renderItem={renderRecordItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                  No settlement records
                </ThemedText>
              </View>
            }
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable style={styles.checkButton}>
          <Feather name="check" size={20} color={theme.textSecondary} />
        </Pressable>
        <Button
          onPress={handleSettleAll}
          disabled={unsettledExpenses.length === 0}
          style={[styles.confirmButton, { backgroundColor: absOwed > 0 ? theme.primary : theme.border }]}
        >
          <ThemedText type="body" style={{ color: "#FFFFFF" }}>
            {absOwed > 0 ? `Confirm total $${absOwed.toFixed(2)}` : "Confirm total"}
          </ThemedText>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
  },
  headerPlaceholder: {
    width: 40,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  expenseItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  categoryIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  expenseInfo: {
    flex: 1,
  },
  recordItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  recordInfo: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5xl"],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  checkButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E5EA",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButton: {
    flex: 1,
  },
});
