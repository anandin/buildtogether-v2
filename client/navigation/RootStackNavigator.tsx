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
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type RootStackParamList = {
  Main: undefined;
  AddExpense: { prefilled?: { amount?: number; description?: string; category?: string; receiptImage?: string } } | undefined;
  ScanReceipt: undefined;
  AddGoal: undefined;
  GoalDetail: { goalId: string };
  FutureTimeline: undefined;
  SetBudget: undefined;
  ExpenseDetail: { expenseId: string };
  SettleUp: undefined;
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
          headerTitle: "Edit Expense",
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
        name="AddGoal"
        component={AddGoalScreen}
        options={{
          presentation: "modal",
          headerTitle: "New Goal",
        }}
      />
      <Stack.Screen
        name="GoalDetail"
        component={GoalDetailScreen}
        options={{
          headerTitle: "Goal Details",
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
    </Stack.Navigator>
  );
}
