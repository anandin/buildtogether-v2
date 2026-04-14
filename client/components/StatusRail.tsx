import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface Props {
  harmonyPct: number;           // 0–100, ratio of savings vs ego spending
  budgetRemaining: number;      // dollars left this month
  partner1Name: string;
  partner1Color: string;
  partner2Name?: string | null;
  partner2Color?: string | null;
  isSolo: boolean;
  onInvitePartner?: () => void; // fired when the "+" avatar is tapped in solo mode
}

/**
 * Compact 56px horizontal status bar replacing the big "THIS WEEK AT A GLANCE"
 * widget. Communicates at-a-glance state through three small, glanceable tiles:
 * Harmony score, Budget remaining, Partner avatars.
 */
export function StatusRail({
  harmonyPct,
  budgetRemaining,
  partner1Name,
  partner1Color,
  partner2Name,
  partner2Color,
  isSolo,
  onInvitePartner,
}: Props) {
  const { theme } = useTheme();

  // Harmony color gradient
  const harmonyColor =
    harmonyPct >= 70 ? theme.success :
    harmonyPct >= 40 ? theme.primary :
    theme.warning;

  const budgetColor =
    budgetRemaining > 500 ? theme.success :
    budgetRemaining > 100 ? theme.warning :
    theme.error;

  return (
    <View style={[styles.rail, { backgroundColor: theme.backgroundDefault }]}>
      {/* Harmony */}
      <View style={styles.tile}>
        <View style={[styles.harmonyDot, { backgroundColor: harmonyColor }]} />
        <View style={styles.tileText}>
          <ThemedText type="tiny" style={{ color: theme.textTertiary, fontSize: 10 }}>
            Harmony
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
            {harmonyPct}%
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Budget remaining */}
      <View style={styles.tile}>
        <Feather name="target" size={16} color={budgetColor} />
        <View style={styles.tileText}>
          <ThemedText type="tiny" style={{ color: theme.textTertiary, fontSize: 10 }}>
            left
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
            ${budgetRemaining.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      {/* Partner avatars */}
      <View style={styles.avatars}>
        <View style={[styles.avatar, { backgroundColor: partner1Color, zIndex: 2 }]}>
          <ThemedText type="tiny" style={styles.avatarText}>
            {(partner1Name?.[0] || "Y").toUpperCase()}
          </ThemedText>
        </View>
        {!isSolo && partner2Name ? (
          <View style={[styles.avatar, styles.avatarStacked, { backgroundColor: partner2Color || theme.accent }]}>
            <ThemedText type="tiny" style={styles.avatarText}>
              {(partner2Name?.[0] || "P").toUpperCase()}
            </ThemedText>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              if (!onInvitePartner) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onInvitePartner();
            }}
            style={[styles.avatar, styles.avatarStacked, styles.invitePlus, { borderColor: theme.border }]}
            accessibilityLabel="Invite partner"
          >
            <Feather name="plus" size={10} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    minHeight: 56,
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  harmonyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tileText: {
    gap: 0,
  },
  divider: {
    width: 1,
    height: 28,
  },
  avatars: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  avatarStacked: {
    marginLeft: -6,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 11,
  },
  invitePlus: {
    backgroundColor: "transparent",
    borderStyle: "dashed",
  },
});
