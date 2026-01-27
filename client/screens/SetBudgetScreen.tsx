import React, { useState } from "react";
import { View, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function SetBudgetScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { data, setBudget } = useApp();

  const [amount, setAmount] = useState(
    data?.budget?.monthlyLimit?.toString() || ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const budgetAmount = parseFloat(amount);
    if (isNaN(budgetAmount) || budgetAmount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await setBudget(budgetAmount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const presets = [1000, 2000, 3000, 5000];

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <ThemedText type="h3" style={styles.title}>
          Set Monthly Budget
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          How much do you want to spend together each month?
        </ThemedText>

        <View style={styles.amountContainer}>
          <ThemedText type="h2" style={{ color: theme.textSecondary }}>
            $
          </ThemedText>
          <TextInput
            style={[styles.amountInput, { color: theme.text }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            autoFocus
          />
        </View>

        <View style={styles.presetsRow}>
          {presets.map((preset) => (
            <Button
              key={preset}
              onPress={() => {
                setAmount(preset.toString());
                Haptics.selectionAsync();
              }}
              style={[
                styles.presetButton,
                {
                  backgroundColor:
                    amount === preset.toString()
                      ? theme.primary
                      : theme.backgroundDefault,
                },
              ]}
            >
              <ThemedText
                type="body"
                style={{
                  color:
                    amount === preset.toString() ? "#FFFFFF" : theme.text,
                }}
              >
                ${preset.toLocaleString()}
              </ThemedText>
            </Button>
          ))}
        </View>

        <Button
          onPress={handleSave}
          disabled={saving || !amount}
          style={styles.saveButton}
        >
          {saving ? "Saving..." : "Set Budget"}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing["3xl"],
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  amountInput: {
    fontSize: 56,
    fontWeight: "700",
    minWidth: 150,
    textAlign: "center",
  },
  presetsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing["3xl"],
  },
  presetButton: {
    paddingHorizontal: Spacing.lg,
    height: 40,
  },
  saveButton: {},
});
