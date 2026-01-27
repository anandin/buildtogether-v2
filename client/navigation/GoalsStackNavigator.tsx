import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import GoalsScreen from "@/screens/GoalsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { HeaderButton } from "@react-navigation/elements";

export type GoalsStackParamList = {
  Goals: undefined;
};

const Stack = createNativeStackNavigator<GoalsStackParamList>();

export default function GoalsStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          headerTitle: "Goals",
          headerRight: () => (
            <HeaderButton
              onPress={() => navigation.navigate("AddGoal")}
              accessibilityLabel="Add goal"
            >
              <Feather name="plus" size={24} color={theme.primary} />
            </HeaderButton>
          ),
        }}
      />
    </Stack.Navigator>
  );
}
