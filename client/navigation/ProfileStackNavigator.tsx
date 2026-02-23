import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ProfileScreen from "@/screens/ProfileScreen";
import BudgetSettingsScreen from "@/screens/BudgetSettingsScreen";
import { BillSplitSettingsScreen } from "@/screens/BillSplitSettingsScreen";
import NotificationSettingsScreen from "@/screens/NotificationSettingsScreen";
import AddCategoryScreen from "@/screens/AddCategoryScreen";
import FamilyProfileScreen from "@/screens/FamilyProfileScreen";
import GuardianMemoryScreen from "@/screens/GuardianMemoryScreen";
import FeedbackScreen from "@/screens/FeedbackScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  BudgetSettings: undefined;
  BillSplitSettings: undefined;
  NotificationSettings: undefined;
  AddCategory: undefined;
  FamilyProfile: undefined;
  GuardianMemory: undefined;
  Feedback: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Settings",
        }}
      />
      <Stack.Screen
        name="BudgetSettings"
        component={BudgetSettingsScreen}
        options={{
          title: "Category Budgets",
        }}
      />
      <Stack.Screen
        name="BillSplitSettings"
        component={BillSplitSettingsScreen}
        options={{
          title: "Bill Splitting",
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          title: "Notifications",
        }}
      />
      <Stack.Screen
        name="AddCategory"
        component={AddCategoryScreen}
        options={{
          title: "Add Category",
        }}
      />
      <Stack.Screen
        name="FamilyProfile"
        component={FamilyProfileScreen}
        options={{
          title: "Family Profile",
        }}
      />
      <Stack.Screen
        name="GuardianMemory"
        component={GuardianMemoryScreen}
        options={{
          title: "AI Memory",
        }}
      />
      <Stack.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{
          title: "Send Feedback",
        }}
      />
    </Stack.Navigator>
  );
}
