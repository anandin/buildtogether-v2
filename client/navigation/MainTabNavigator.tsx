/**
 * 4-tab bottom navigation (down from V1's 5 tabs).
 *
 *   Guardian  — GuardianHomeScreen (renamed from "Home")
 *   Activity  — Expenses list + Charts toggle + partner activity feed
 *   Dreams    — Savings goals
 *   You       — Profile + Settings + subscription (merged)
 *
 * Insights/Charts is absorbed into Activity. Settings + Profile merged to "You".
 * Active-tab icons use Ionicons' filled variant for warmer affordance, inactive
 * tabs use Feather outlines for lightness.
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Image } from "react-native";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import ExpensesStackNavigator from "@/navigation/ExpensesStackNavigator";
import DreamsStackNavigator from "@/navigation/DreamsStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { useTheme } from "@/hooks/useTheme";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

export type MainTabParamList = {
  HomeTab: undefined;       // Guardian
  ExpensesTab: undefined;   // Activity
  DreamsTab: undefined;     // Dreams
  ProfileTab: undefined;    // You
};

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Guardian tab icon — the owl avatar, slightly larger than other icons.
 * When active, it gets a soft violet backdrop to signal presence.
 */
function GuardianTabIcon({ focused, color }: { focused: boolean; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={[
      tabIconStyles.guardianWrap,
      { backgroundColor: focused ? theme.aiLight : "transparent" },
    ]}>
      <Image source={dreamGuardianIcon} style={tabIconStyles.guardianImage} />
    </View>
  );
}

export default function MainTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.backgroundRoot,
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Platform.select({ ios: 88, android: 64 }),
          paddingTop: 6,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: "Guardian",
          tabBarIcon: ({ focused, color }) => (
            <GuardianTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ExpensesTab"
        component={ExpensesStackNavigator}
        options={{
          title: "Activity",
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <Ionicons name="pulse" size={size + 2} color={color} />
            ) : (
              <Feather name="activity" size={size} color={color} />
            ),
        }}
      />
      <Tab.Screen
        name="DreamsTab"
        component={DreamsStackNavigator}
        options={{
          title: "Dreams",
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <Ionicons name="star" size={size + 2} color={color} />
            ) : (
              <Feather name="star" size={size} color={color} />
            ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: "You",
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <Ionicons name="person" size={size + 2} color={color} />
            ) : (
              <Feather name="user" size={size} color={color} />
            ),
        }}
      />
    </Tab.Navigator>
  );
}

const tabIconStyles = StyleSheet.create({
  guardianWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  guardianImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
