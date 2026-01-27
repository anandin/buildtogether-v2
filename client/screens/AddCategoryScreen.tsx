import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { CATEGORY_COLORS } from "@/types";

const AVAILABLE_ICONS = [
  "shopping-bag", "coffee", "heart", "star", "gift", "home",
  "truck", "book", "music", "camera", "briefcase", "tool",
  "watch", "umbrella", "scissors", "headphones", "monitor", "smartphone",
  "tablet", "tv", "speaker", "printer", "package", "box",
];

const AVAILABLE_COLORS = [
  "#FF9AA2", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#B5EAD7",
  "#C7CEEA", "#A2D2FF", "#CDB4DB", "#F8B4D9", "#FFD93D",
  "#FF6B6B", "#D4A574", "#6366F1", "#10B981", "#F59E0B",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316",
];

export default function AddCategoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { addCustomCategory, updateCategoryBudget } = useApp();

  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("shopping-bag");
  const [selectedColor, setSelectedColor] = useState("#C7CEEA");
  const [monthlyLimit, setMonthlyLimit] = useState("200");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || saving) return;

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const category = await addCustomCategory(name.trim(), selectedIcon, selectedColor);
      
      await updateCategoryBudget(category.id, {
        monthlyLimit: parseFloat(monthlyLimit) || 200,
        budgetType: "recurring",
        alertThreshold: 80,
        rolloverBalance: 0,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (error) {
      console.error("Error adding category:", error);
      setSaving(false);
    }
  };

  const isValid = name.trim().length > 0 && parseFloat(monthlyLimit) > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <Card style={styles.previewCard}>
          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: selectedColor + "20" }]}>
              <Feather name={selectedIcon as any} size={24} color={selectedColor} />
            </View>
            <View style={styles.previewInfo}>
              <ThemedText type="heading">{name || "Category Name"}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                ${monthlyLimit || "0"}/month budget
              </ThemedText>
            </View>
          </View>
        </Card>

        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Category Name
        </ThemedText>
        <TextInput
          style={[styles.textInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Date Night, Hobbies, Childcare..."
          placeholderTextColor={theme.textSecondary}
          autoFocus
        />

        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Monthly Budget
        </ThemedText>
        <View style={[styles.amountInput, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <ThemedText type="h2" style={{ color: theme.textSecondary }}>$</ThemedText>
          <TextInput
            style={[styles.amountField, { color: theme.text }]}
            value={monthlyLimit}
            onChangeText={setMonthlyLimit}
            keyboardType="numeric"
            placeholder="200"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Choose an Icon
        </ThemedText>
        <View style={styles.iconGrid}>
          {AVAILABLE_ICONS.map((icon) => (
            <Pressable
              key={icon}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedIcon(icon);
              }}
              style={[
                styles.iconItem,
                {
                  backgroundColor: selectedIcon === icon ? selectedColor : theme.backgroundDefault,
                  borderColor: selectedIcon === icon ? selectedColor : theme.border,
                },
              ]}
            >
              <Feather
                name={icon as any}
                size={20}
                color={selectedIcon === icon ? "#FFFFFF" : theme.text}
              />
            </Pressable>
          ))}
        </View>

        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          Choose a Color
        </ThemedText>
        <View style={styles.colorGrid}>
          {AVAILABLE_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedColor(color);
              }}
              style={[
                styles.colorItem,
                {
                  backgroundColor: color,
                  borderWidth: selectedColor === color ? 3 : 0,
                  borderColor: "#FFFFFF",
                },
              ]}
            >
              {selectedColor === color ? (
                <Feather name="check" size={16} color="#FFFFFF" />
              ) : null}
            </Pressable>
          ))}
        </View>

        <Button
          onPress={handleSave}
          disabled={!isValid || saving}
          style={styles.saveButton}
        >
          {saving ? "Creating..." : "Create Category"}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  previewCard: {
    marginBottom: Spacing.xl,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  label: {
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  textInput: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontSize: 16,
  },
  amountInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  amountField: {
    flex: 1,
    fontSize: 24,
    fontWeight: "600",
    marginLeft: Spacing.xs,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  iconItem: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  colorItem: {
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
