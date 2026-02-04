import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Platform, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, addMonths } from "date-fns";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

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
  const [targetDate, setTargetDate] = useState<Date | null>(addMonths(new Date(), 6));
  const [whyItMatters, setWhyItMatters] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
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
        targetDate: targetDate ? format(targetDate, "yyyy-MM-dd") : undefined,
        whyItMatters: whyItMatters.trim() || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl + 100,
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
        <Pressable 
          style={[styles.amountInput, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
          onPress={() => Keyboard.dismiss()}
        >
          <ThemedText type="h4" style={{ color: theme.textSecondary }}>$</ThemedText>
          <TextInput
            style={[styles.amountInputField, { color: theme.text }]}
            value={targetAmount}
            onChangeText={setTargetAmount}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </Pressable>
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

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Target Date (optional)
        </ThemedText>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={[
            styles.dateButton,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
        >
          <Feather name="calendar" size={20} color={theme.textSecondary} />
          <ThemedText style={{ marginLeft: Spacing.md }}>
            {targetDate ? format(targetDate, "MMMM d, yyyy") : "Pick a date"}
          </ThemedText>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={targetDate || new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
        {Platform.OS === "ios" && showDatePicker && (
          <Pressable
            onPress={() => setShowDatePicker(false)}
            style={[styles.doneButton, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={{ color: "#FFFFFF" }}>Done</ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Why Does This Dream Matter? (optional)
        </ThemedText>
        <TextInput
          style={[
            styles.whyInput,
            {
              color: theme.text,
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          value={whyItMatters}
          onChangeText={setWhyItMatters}
          placeholder="This helps us motivate you when things get tough..."
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
          The Dream Guardian will remind you of this when you need motivation
        </ThemedText>
      </View>

      <Button
        onPress={handleSave}
        disabled={saving || !name.trim() || !targetAmount}
        style={styles.saveButton}
      >
        {saving ? "Creating..." : "Create Dream"}
      </Button>
    </KeyboardAwareScrollViewCompat>
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
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
  },
  doneButton: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  whyInput: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 100,
  },
  saveButton: {
    marginTop: Spacing.xl,
  },
});
