import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { GOAL_COLORS, GOAL_EMOJIS } from "@/types";

export default function AddGoalScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { addGoal } = useApp();

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState(GOAL_EMOJIS[0]);
  const [selectedColor, setSelectedColor] = useState(GOAL_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    try {
      await addGoal({
        name: name.trim(),
        targetAmount: amount,
        emoji: selectedEmoji,
        color: selectedColor,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.previewCard, { backgroundColor: selectedColor + "15" }]}>
        <View style={[styles.previewIcon, { backgroundColor: selectedColor + "30" }]}>
          <Feather name={selectedEmoji as any} size={32} color={selectedColor} />
        </View>
        <ThemedText type="h4" style={{ marginTop: Spacing.md }}>
          {name || "Your Goal"}
        </ThemedText>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>
          ${targetAmount || "0"} target
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Goal Name
        </ThemedText>
        <TextInput
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Dream Vacation, New Home"
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Target Amount
        </ThemedText>
        <View style={[styles.amountInput, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <ThemedText type="h4" style={{ color: theme.textSecondary }}>$</ThemedText>
          <TextInput
            style={[styles.amountInputField, { color: theme.text }]}
            value={targetAmount}
            onChangeText={setTargetAmount}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Icon
        </ThemedText>
        <View style={styles.emojiGrid}>
          {GOAL_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                setSelectedEmoji(emoji);
                Haptics.selectionAsync();
              }}
              style={[
                styles.emojiButton,
                {
                  backgroundColor:
                    selectedEmoji === emoji
                      ? selectedColor + "20"
                      : theme.backgroundDefault,
                  borderColor:
                    selectedEmoji === emoji ? selectedColor : theme.border,
                },
              ]}
            >
              <Feather
                name={emoji as any}
                size={24}
                color={selectedEmoji === emoji ? selectedColor : theme.textSecondary}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Color
        </ThemedText>
        <View style={styles.colorGrid}>
          {GOAL_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => {
                setSelectedColor(color);
                Haptics.selectionAsync();
              }}
              style={[
                styles.colorButton,
                {
                  backgroundColor: color,
                  borderWidth: selectedColor === color ? 3 : 0,
                  borderColor: theme.text,
                },
              ]}
            >
              {selectedColor === color ? (
                <Feather name="check" size={20} color="#FFFFFF" />
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>

      <Button
        onPress={handleSave}
        disabled={saving || !name.trim() || !targetAmount}
        style={styles.saveButton}
      >
        {saving ? "Creating..." : "Create Goal"}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  previewCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing["2xl"],
  },
  previewIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    marginBottom: Spacing.xl,
  },
  label: {
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    fontSize: 16,
  },
  amountInput: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
  },
  amountInputField: {
    flex: 1,
    fontSize: 20,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  emojiButton: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  colorGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    marginTop: Spacing.xl,
  },
});
