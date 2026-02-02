import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import AddExpenseScreen from "@/screens/AddExpenseScreen";
import ScanReceiptScreen from "@/screens/ScanReceiptScreen";
import AddGoalScreen from "@/screens/AddGoalScreen";
import GoalDetailScreen from "@/screens/GoalDetailScreen";
import SetBudgetScreen from "@/screens/SetBudgetScreen";
import ExpenseDetailScreen from "@/screens/ExpenseDetailScreen";
import SettleUpScreen from "@/screens/SettleUpScreen";
import { FutureTimelineScreen } from "@/screens/FutureTimelineScreen";
import { BillSplitSettingsScreen } from "@/screens/BillSplitSettingsScreen";
import PartnerInviteScreen from "@/screens/PartnerInviteScreen";
import PrivacyPolicyScreen from "@/screens/PrivacyPolicyScreen";
import TermsOfServiceScreen from "@/screens/TermsOfServiceScreen";
import ConfirmSavingsScreen from "@/screens/ConfirmSavingsScreen";
import PaywallScreen from "@/screens/PaywallScreen";
import SubscriptionManagementScreen from "@/screens/SubscriptionManagementScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type RootStackParamList = {
  Main: undefined;
  AddExpense: { prefilled?: { amount?: number; description?: string; category?: string; receiptImage?: string } } | undefined;
  ScanReceipt: undefined;
  AddDream: undefined;
  DreamDetail: { dreamId?: string; goalId?: string; suggestedAmount?: number; fromCoach?: boolean };
  FutureTimeline: undefined;
  SetBudget: undefined;
  ExpenseDetail: { expenseId: string };
  SettleUp: undefined;
  BillSplitSettings: undefined;
  PartnerInvite: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  ConfirmSavings: { suggestedAmount?: number; goalId?: string; recommendationId?: string } | undefined;
  Paywall: undefined;
  SubscriptionManagement: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={{
          presentation: "modal",
          headerTitle: "Add Expense",
        }}
      />
      <Stack.Screen
        name="ScanReceipt"
        component={ScanReceiptScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AddDream"
        component={AddGoalScreen}
        options={{
          presentation: "modal",
          headerTitle: "New Dream",
        }}
      />
      <Stack.Screen
        name="DreamDetail"
        component={GoalDetailScreen}
        options={{
          headerTitle: "Dream Details",
        }}
      />
      <Stack.Screen
        name="FutureTimeline"
        component={FutureTimelineScreen}
        options={{
          headerTitle: "Future Us",
        }}
      />
      <Stack.Screen
        name="SetBudget"
        component={SetBudgetScreen}
        options={{
          presentation: "modal",
          headerTitle: "Set Budget",
        }}
      />
      <Stack.Screen
        name="ExpenseDetail"
        component={ExpenseDetailScreen}
        options={{
          headerTitle: "Details",
        }}
      />
      <Stack.Screen
        name="SettleUp"
        component={SettleUpScreen}
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="BillSplitSettings"
        component={BillSplitSettingsScreen}
        options={{
          headerTitle: "Bill Splitting",
        }}
      />
      <Stack.Screen
        name="PartnerInvite"
        component={PartnerInviteScreen}
        options={{
          headerTitle: "Connect Partner",
        }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{
          headerTitle: "Privacy Policy",
        }}
      />
      <Stack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{
          headerTitle: "Terms of Service",
        }}
      />
      <Stack.Screen
        name="ConfirmSavings"
        component={ConfirmSavingsScreen}
        options={{
          presentation: "modal",
          headerTitle: "Confirm Savings",
        }}
      />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SubscriptionManagement"
        component={SubscriptionManagementScreen}
        options={{
          headerTitle: "Subscription",
        }}
      />
    </Stack.Navigator>
  );
}
