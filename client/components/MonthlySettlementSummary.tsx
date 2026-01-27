import React, { useMemo, useState, useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Expense, BillSplitPreference } from "@/types";
import { loadBillSplitPreference } from "@/screens/BillSplitSettingsScreen";

interface SettlementData {
  partner1Paid: number;
  partner2Paid: number;
  partner1Share: number;
  partner2Share: number;
  owedBy: "partner1" | "partner2" | null;
  owedAmount: number;
}

function calculateMonthlySettlement(
  expenses: Expense[],
  preference: BillSplitPreference,
  month: Date
): SettlementData {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const monthlyExpenses = expenses.filter((e) =>
    isWithinInterval(new Date(e.date), { start: monthStart, end: monthEnd })
  );

  const sharedExpenses = monthlyExpenses.filter((e) =>
    preference.sharedCategories.includes(e.category)
  );

  let partner1Paid = 0;
  let partner2Paid = 0;
  let totalShared = 0;

  sharedExpenses.forEach((expense) => {
    totalShared += expense.amount;
    if (expense.paidBy === "partner1") {
      partner1Paid += expense.amount;
    } else if (expense.paidBy === "partner2") {
      partner2Paid += expense.amount;
    } else {
      partner1Paid += expense.amount / 2;
      partner2Paid += expense.amount / 2;
    }
  });

  const partner1Share = (totalShared * preference.partner1Ratio) / 100;
  const partner2Share = (totalShared * preference.partner2Ratio) / 100;

  const partner1Owes = partner1Share - partner1Paid;
  const partner2Owes = partner2Share - partner2Paid;

  let owedBy: "partner1" | "partner2" | null = null;
  let owedAmount = 0;

  if (partner1Owes > 0.01) {
    owedBy = "partner1";
    owedAmount = partner1Owes;
  } else if (partner2Owes > 0.01) {
    owedBy = "partner2";
    owedAmount = partner2Owes;
  }

  return {
    partner1Paid,
    partner2Paid,
    partner1Share,
    partner2Share,
    owedBy,
    owedAmount,
  };
}

interface Props {
  onSettleUp?: () => void;
}

export function MonthlySettlementSummary({ onSettleUp }: Props) {
  const { theme } = useTheme();
  const { data } = useApp();
  const [preference, setPreference] = useState<BillSplitPreference | null>(null);

  useEffect(() => {
    loadBillSplitPreference().then(setPreference);
  }, []);

  const settlement = useMemo(() => {
    if (!data || !preference) return null;
    return calculateMonthlySettlement(data.expenses, preference, new Date());
  }, [data?.expenses, preference]);

  if (!settlement || !preference) {
    return null;
  }

  const partner1Name = data?.partners.partner1.name || "Partner 1";
  const partner2Name = data?.partners.partner2.name || "Partner 2";
  const currentMonth = format(new Date(), "MMMM");

  const isBalanced = !settlement.owedBy;
  const owingPartnerName = settlement.owedBy === "partner1" ? partner1Name : partner2Name;
  const owedPartnerName = settlement.owedBy === "partner1" ? partner2Name : partner1Name;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="pie-chart" size={20} color={theme.primary} />
          <ThemedText type="heading">{currentMonth} Split</ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: isBalanced ? theme.success + "20" : theme.warning + "20" }]}>
          <Feather
            name={isBalanced ? "check" : "alert-circle"}
            size={14}
            color={isBalanced ? theme.success : theme.warning}
          />
          <ThemedText type="tiny" style={{ color: isBalanced ? theme.success : theme.warning }}>
            {isBalanced ? "Balanced" : "Uneven"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.breakdown}>
        <View style={styles.partnerRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText style={{ fontSize: 14 }}>{partner1Name[0]}</ThemedText>
            </View>
            <View>
              <ThemedText type="small">{partner1Name}</ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Paid ${settlement.partner1Paid.toFixed(2)}
              </ThemedText>
            </View>
          </View>
          <View style={styles.shareInfo}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Share: ${settlement.partner1Share.toFixed(2)}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.partnerRow}>
          <View style={styles.partnerInfo}>
            <View style={[styles.avatar, { backgroundColor: theme.accent + "20" }]}>
              <ThemedText style={{ fontSize: 14 }}>{partner2Name[0]}</ThemedText>
            </View>
            <View>
              <ThemedText type="small">{partner2Name}</ThemedText>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Paid ${settlement.partner2Paid.toFixed(2)}
              </ThemedText>
            </View>
          </View>
          <View style={styles.shareInfo}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Share: ${settlement.partner2Share.toFixed(2)}
            </ThemedText>
          </View>
        </View>
      </View>

      {!isBalanced ? (
        <View style={[styles.settlementRow, { backgroundColor: theme.warning + "10" }]}>
          <Feather name="arrow-right" size={16} color={theme.warning} />
          <ThemedText type="small" style={{ flex: 1 }}>
            <ThemedText type="small" style={{ fontWeight: "600" }}>{owingPartnerName}</ThemedText>
            {" owes "}
            <ThemedText type="small" style={{ fontWeight: "600" }}>{owedPartnerName}</ThemedText>
          </ThemedText>
          <ThemedText type="body" style={{ fontWeight: "700", color: theme.warning }}>
            ${settlement.owedAmount.toFixed(2)}
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.settlementRow, { backgroundColor: theme.success + "10" }]}>
          <Feather name="check-circle" size={16} color={theme.success} />
          <ThemedText type="small" style={{ color: theme.success }}>
            You're all squared up this month!
          </ThemedText>
        </View>
      )}

      {onSettleUp && !isBalanced ? (
        <Pressable
          onPress={onSettleUp}
          style={[styles.settleButton, { backgroundColor: theme.primary }]}
        >
          <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>
            Settle Up
          </ThemedText>
          <Feather name="arrow-right" size={16} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs / 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    borderRadius: BorderRadius.full,
  },
  breakdown: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partnerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareInfo: {
    alignItems: "flex-end",
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  settleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
