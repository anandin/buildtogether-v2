import React from "react";
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { CommitmentsSection } from "@/components/CommitmentsSection";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Goal } from "@/types";
import { GOAL_EMOJIS } from "@/types";

export default function DreamsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();
  const { user } = useAuth();
  const { isPremium } = useSubscription();

  const handleAddDream = () => {
    navigation.navigate("AddDream");
  };

  const getEmojiIcon = (emoji: string) => {
    if (GOAL_EMOJIS.includes(emoji as any)) {
      return emoji as any;
    }
    return "star";
  };

  const renderDreamCard = ({ item }: { item: Goal }) => {
    const progress = item.targetAmount > 0 
      ? (item.savedAmount / item.targetAmount) * 100 
      : 0;
    const remaining = item.targetAmount - item.savedAmount;

    return (
      <Card 
        style={styles.dreamCard}
        onPress={() => navigation.navigate("DreamDetail", { dreamId: item.id })}
      >
        <View style={styles.dreamHeader}>
          <View style={[styles.dreamIcon, { backgroundColor: item.color + "20" }]}>
            <Feather name={getEmojiIcon(item.emoji)} size={24} color={item.color} />
          </View>
          <View style={styles.dreamInfo}>
            <ThemedText type="heading" numberOfLines={1}>{item.name}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              ${item.savedAmount.toFixed(0)} of ${item.targetAmount.toFixed(0)}
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </View>

        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <View 
            style={[
              styles.progressFill, 
              { 
                backgroundColor: item.color,
                width: `${Math.min(progress, 100)}%` 
              }
            ]} 
          />
        </View>

        <View style={styles.dreamFooter}>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
            {progress.toFixed(0)}% complete
          </ThemedText>
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
            ${remaining.toFixed(0)} to go
          </ThemedText>
        </View>
      </Card>
    );
  };

  const renderEmpty = () => (
    <EmptyState
      icon="star"
      title="Dream together"
      description="Create shared dreams and save for your future as a team"
      actionLabel="Create First Dream"
      onAction={handleAddDream}
    />
  );

  const renderHeader = () => {
    const totalSaved = data?.goals.reduce((sum, g) => sum + g.savedAmount, 0) || 0;
    const totalTarget = data?.goals.reduce((sum, g) => sum + g.targetAmount, 0) || 0;
    const dreamCount = data?.goals.length || 0;

    if (dreamCount === 0) return null;

    return (
      <View>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                Total Saved
              </ThemedText>
              <ThemedText type="h2" style={{ color: theme.success }}>
                ${totalSaved.toFixed(0)}
              </ThemedText>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryItem}>
              <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
                {dreamCount} Dream{dreamCount !== 1 ? "s" : ""}
              </ThemedText>
              <ThemedText type="h2">
                ${totalTarget.toFixed(0)}
              </ThemedText>
            </View>
          </View>
        </Card>

        {isPremium && user?.coupleId ? (
          <CommitmentsSection 
            coupleId={user.coupleId} 
            onRefresh={refreshData}
          />
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl + 80,
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={data?.goals || []}
        keyExtractor={(item) => item.id}
        renderItem={renderDreamCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshData} />
        }
      />
      
      {(data?.goals?.length || 0) > 0 ? (
        <Pressable 
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={handleAddDream}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryDivider: {
    width: 1,
    height: 40,
  },
  dreamCard: {
    marginBottom: Spacing.md,
  },
  dreamHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  dreamIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dreamInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  dreamFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
