import React from "react";
import { View, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";

import { GoalCard } from "@/components/GoalCard";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing } from "@/constants/theme";
import type { Goal } from "@/types";

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, loading, refreshData } = useApp();

  const handleAddGoal = () => {
    navigation.navigate("AddGoal");
  };

  const renderItem = ({ item, index }: { item: Goal; index: number }) => (
    <View style={[styles.goalWrapper, index % 2 === 1 && styles.goalWrapperRight]}>
      <GoalCard
        goal={item}
        onPress={() => navigation.navigate("GoalDetail", { goalId: item.id })}
      />
    </View>
  );

  const renderEmpty = () => (
    <EmptyState
      image={require("../../assets/images/empty-goals.png")}
      title="Start building together"
      description="Create shared goals and save for your dreams as a team"
      actionLabel="Create First Goal"
      onAction={handleAddGoal}
    />
  );

  return (
    <FlatList
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={data?.goals || []}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refreshData} />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  goalWrapper: {
    flex: 1,
  },
  goalWrapperRight: {},
});
