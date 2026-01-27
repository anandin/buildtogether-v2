import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ChartScreen from "@/screens/ChartScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ChartStackParamList = {
  Chart: undefined;
};

const Stack = createNativeStackNavigator<ChartStackParamList>();

export default function ChartStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Chart"
        component={ChartScreen}
        options={{
          headerTitle: "Insights",
        }}
      />
    </Stack.Navigator>
  );
}
