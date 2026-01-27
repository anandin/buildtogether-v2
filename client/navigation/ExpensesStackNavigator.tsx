import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ExpensesScreen from "@/screens/ExpensesScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ExpensesStackParamList = {
  Expenses: undefined;
};

const Stack = createNativeStackNavigator<ExpensesStackParamList>();

export default function ExpensesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          headerTitle: "Expenses",
        }}
      />
    </Stack.Navigator>
  );
}
