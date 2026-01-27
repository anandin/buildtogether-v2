import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import DreamsScreen from "@/screens/DreamsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type DreamsStackParamList = {
  Dreams: undefined;
};

const Stack = createNativeStackNavigator<DreamsStackParamList>();

export default function DreamsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Dreams"
        component={DreamsScreen}
        options={{
          headerTitle: "Dreams",
        }}
      />
    </Stack.Navigator>
  );
}
