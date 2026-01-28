import React, { useState, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { getUnsettledExpenses, calculateOwedAmounts } from "@/lib/cloudStorage";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "@/types";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

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
            {format(new Date(item.date), "MMM d")} · {data?.partners[item.paidBy as keyof typeof data.partners]?.name}
          </ThemedText>
        </View>
        <ThemedText type="heading">${item.amount.toFixed(2)}</ThemedText>
      </Pressable>
    );
  };

  const renderRecordItem = ({ item }: any) => (
    <View style={[styles.recordItem, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.recordIcon, { backgroundColor: theme.success + "15" }]}>
        <Feather name="check-circle" size={18} color={theme.success} />
      </View>
      <View style={styles.recordInfo}>
        <ThemedText type="body">
          {data?.partners[item.from as keyof typeof data.partners]?.name} paid {data?.partners[item.to as keyof typeof data.partners]?.name}
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

  const EmptyUnsettledState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.success + "15" }]}>
        <Feather name="check-circle" size={48} color={theme.success} />
      </View>
      <ThemedText type="heading" style={{ marginTop: Spacing.lg, marginBottom: Spacing.xs }}>
        All settled!
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", maxWidth: 260 }}>
        You're all caught up. No pending expenses to split with your partner.
      </ThemedText>
    </View>
  );

  const EmptyRecordsState = () => (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconContainer, { backgroundColor: theme.primary + "15" }]}>
        <Feather name="clock" size={48} color={theme.primary} />
      </View>
      <ThemedText type="heading" style={{ marginTop: Spacing.lg, marginBottom: Spacing.xs }}>
        No history yet
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", maxWidth: 260 }}>
        Once you settle expenses, they'll appear here as a record of your payments.
      </ThemedText>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={[styles.closeButton, { backgroundColor: theme.backgroundDefault }]}
        >
          <Feather name="x" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="heading">Settle Up</ThemedText>
        <View style={styles.headerPlaceholder} />
      </View>

      {absOwed > 0 && activeTab === "unsettled" ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryContent}>
            <Image source={dreamGuardianIcon} style={styles.guardianIcon} resizeMode="cover" />
            <View style={styles.summaryText}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Settlement Summary
              </ThemedText>
              <ThemedText type="body">
                <ThemedText type="body" style={{ fontWeight: "700" }}>
                  {data?.partners[whoOwes]?.name}
                </ThemedText>
                {" owes "}
                <ThemedText type="body" style={{ fontWeight: "700" }}>
                  {data?.partners[whoGets]?.name}
                </ThemedText>
              </ThemedText>
            </View>
            <View style={[styles.amountBadge, { backgroundColor: theme.primary + "15" }]}>
              <ThemedText type="heading" style={{ color: theme.primary }}>
                ${absOwed.toFixed(2)}
              </ThemedText>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <Pressable
          style={[
            styles.tab,
            activeTab === "unsettled" && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab("unsettled")}
        >
          <ThemedText
            type="body"
            style={{ 
              color: activeTab === "unsettled" ? theme.primary : theme.textSecondary,
              fontWeight: activeTab === "unsettled" ? "600" : "400",
            }}
          >
            Pending
          </ThemedText>
          {unsettledExpenses.length > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <ThemedText type="tiny" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                {unsettledExpenses.length}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[
            styles.tab,
            activeTab === "records" && { borderBottomColor: theme.primary },
          ]}
          onPress={() => setActiveTab("records")}
        >
          <ThemedText
            type="body"
            style={{ 
              color: activeTab === "records" ? theme.primary : theme.textSecondary,
              fontWeight: activeTab === "records" ? "600" : "400",
            }}
          >
            History
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
            <EmptyUnsettledState />
          )
        ) : (
          <FlatList
            data={data?.settlements || []}
            keyExtractor={(item) => item.id}
            renderItem={renderRecordItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<EmptyRecordsState />}
          />
        )}
      </View>

      {activeTab === "unsettled" && unsettledExpenses.length > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Button
            onPress={handleSettleAll}
            style={[styles.confirmButton, { backgroundColor: theme.primary }]}
          >
            <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: Spacing.sm }} />
            <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
              Mark as Settled · ${absOwed.toFixed(2)}
            </ThemedText>
          </Button>
        </View>
      ) : null}
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
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPlaceholder: {
    width: 36,
  },
  summaryCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  summaryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  guardianIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  amountBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginHorizontal: Spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    gap: Spacing.xs,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
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
    gap: 2,
  },
  recordItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  recordIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  recordInfo: {
    flex: 1,
    gap: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
