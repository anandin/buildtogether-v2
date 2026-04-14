/**
 * Dreams — rebuilt for V2.
 *
 * Replaces V1's monolithic list of giant cards with a 2-column grid of
 * compact cards matching the visual language of Home. Adds per-dream
 * Guardian suggestion row ("You're on track — keep it up!"), total-saved
 * hero strip, and a FAB to add more dreams. Premium users also see their
 * active commitments section below the grid.
 */
import React, { useMemo } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { CommitmentsSection } from "@/components/CommitmentsSection";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Goal } from "@/types";

function dreamStatus(pct: number): { label: string; color: string } {
  if (pct >= 100) return { label: "Complete!", color: "#10B981" };
  if (pct >= 75) return { label: "Almost there", color: "#10B981" };
  if (pct >= 40) return { label: "Good pace", color: "#6366F1" };
  if (pct >= 10) return { label: "Getting started", color: "#F59E0B" };
  return { label: "Just beginning", color: "#F59E0B" };
}

function DreamGridCard({
  goal,
  onPress,
}: {
  goal: Goal;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const pct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
  const capPct = Math.min(pct, 100);
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const { label, color: statusColor } = dreamStatus(pct);
  const accent = goal.color || theme.primary;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.gridCard,
        {
          backgroundColor: theme.backgroundDefault,
          borderColor: accent + "30",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.gridCardHeader}>
        <ThemedText style={styles.gridEmoji}>{goal.emoji || "⭐"}</ThemedText>
        <View style={[styles.statusPill, { backgroundColor: statusColor + "15" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <ThemedText type="tiny" style={{ color: statusColor, fontWeight: "600", fontSize: 10 }}>
            {Math.round(pct)}%
          </ThemedText>
        </View>
      </View>

      <ThemedText
        type="small"
        numberOfLines={1}
        style={{ color: theme.text, fontWeight: "600", marginTop: Spacing.xs }}
      >
        {goal.name}
      </ThemedText>

      <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
        ${goal.savedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        <ThemedText type="tiny" style={{ color: theme.textTertiary }}>
          {" "}of ${goal.targetAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </ThemedText>
      </ThemedText>

      <View style={[styles.track, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={[styles.fill, { backgroundColor: accent, width: `${capPct}%` }]} />
      </View>

      <ThemedText type="tiny" style={{ color: theme.textTertiary, fontSize: 11 }}>
        {label} · ${remaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} to go
      </ThemedText>
    </Pressable>
  );
}

export default function DreamsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const { isPremium } = useSubscription();

  const dreams = data?.goals || [];

  const totalSaved = useMemo(
    () => dreams.reduce((s, g) => s + g.savedAmount, 0),
    [dreams],
  );
  const totalTarget = useMemo(
    () => dreams.reduce((s, g) => s + g.targetAmount, 0),
    [dreams],
  );
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;
  const closest = useMemo(
    () =>
      [...dreams]
        .map(d => ({ d, pct: d.targetAmount > 0 ? d.savedAmount / d.targetAmount : 0 }))
        .filter(x => x.pct < 1)
        .sort((a, b) => b.pct - a.pct)[0],
    [dreams],
  );

  const handleAddDream = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("AddDream");
  };

  if (dreams.length === 0) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.backgroundRoot,
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight,
          },
        ]}
      >
        <EmptyState
          icon="star"
          title="No dreams yet"
          description="Set a savings goal and I'll help you get there."
          actionLabel="Add your first dream"
          onAction={handleAddDream}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: tabBarHeight + Spacing["3xl"],
          paddingHorizontal: Spacing.lg,
          gap: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshData} />}
      >
        {/* Hero strip — total saved across all dreams */}
        <View style={[styles.hero, { backgroundColor: theme.aiLight, borderColor: theme.aiPrimary + "30" }]}>
          <View style={{ flex: 1 }}>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              Dreams protected
            </ThemedText>
            <ThemedText type="h2" style={{ color: theme.aiDark }}>
              ${totalSaved.toLocaleString()}
            </ThemedText>
            <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
              {overallPct}% of ${totalTarget.toLocaleString()} total
            </ThemedText>
          </View>
          {closest ? (
            <View style={styles.heroClosest}>
              <ThemedText type="tiny" style={{ color: theme.textSecondary, textAlign: "right" }}>
                Closest finish
              </ThemedText>
              <ThemedText
                type="small"
                numberOfLines={1}
                style={{ color: theme.text, fontWeight: "600", textAlign: "right" }}
              >
                {closest.d.emoji} {closest.d.name}
              </ThemedText>
              <ThemedText type="tiny" style={{ color: theme.aiPrimary, textAlign: "right" }}>
                {Math.round(closest.pct * 100)}% done
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Grid of compact dream cards */}
        <View style={styles.sectionHeader}>
          <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>
            Your dreams
          </ThemedText>
          <Pressable
            onPress={handleAddDream}
            style={[styles.addButton, { backgroundColor: theme.primary + "15" }]}
          >
            <Feather name="plus" size={14} color={theme.primary} />
            <ThemedText type="tiny" style={{ color: theme.primary, fontWeight: "600" }}>
              Add
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {dreams.map(goal => (
            <DreamGridCard
              key={goal.id}
              goal={goal}
              onPress={() => navigation.navigate("DreamDetail", { dreamId: goal.id })}
            />
          ))}
        </View>

        {/* Commitments — premium users only, but visually integrated */}
        {isPremium && user?.coupleId ? (
          <CommitmentsSection coupleId={user.coupleId} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  heroClosest: {
    maxWidth: 140,
    gap: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    justifyContent: "space-between",
  },
  gridCard: {
    width: "48.5%",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 4,
  },
  gridCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  gridEmoji: {
    fontSize: 26,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 4,
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
