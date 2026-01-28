import React, { useState } from "react";
import { View, StyleSheet, TextInput, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const COUPLE_ID_KEY = "@couple_id";

export default function FamilyProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { refreshData } = useApp();

  const [numAdults, setNumAdults] = useState(2);
  const [numKidsUnder5, setNumKidsUnder5] = useState(0);
  const [numKids5to12, setNumKids5to12] = useState(0);
  const [numTeens, setNumTeens] = useState(0);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("US");
  const [saving, setSaving] = useState(false);

  const totalFamilySize = numAdults + numKidsUnder5 + numKids5to12 + numTeens;
  const hasKids = numKidsUnder5 + numKids5to12 + numTeens > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const coupleId = await AsyncStorage.getItem(COUPLE_ID_KEY);
      if (coupleId) {
        await apiRequest("PUT", `/api/family/${coupleId}`, {
          numAdults,
          numKidsUnder5,
          numKids5to12,
          numTeens,
          city: city.trim() || null,
          country: country.trim() || "US",
        });
        await refreshData();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.goBack();
      }
    } catch (error) {
      console.error("Failed to save family profile:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const NumberStepper = ({ 
    value, 
    onValueChange, 
    min = 0, 
    max = 10,
    label,
    sublabel,
  }: { 
    value: number; 
    onValueChange: (v: number) => void;
    min?: number;
    max?: number;
    label: string;
    sublabel?: string;
  }) => (
    <View style={styles.stepperRow}>
      <View style={styles.stepperLabel}>
        <ThemedText type="body">{label}</ThemedText>
        {sublabel ? (
          <ThemedText type="tiny" style={{ color: theme.textSecondary }}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          style={[
            styles.stepperButton,
            { 
              backgroundColor: value > min ? theme.primary + "20" : theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          onPress={() => {
            if (value > min) {
              onValueChange(value - 1);
              Haptics.selectionAsync();
            }
          }}
          disabled={value <= min}
        >
          <Feather 
            name="minus" 
            size={18} 
            color={value > min ? theme.primary : theme.textSecondary} 
          />
        </Pressable>
        <ThemedText type="heading" style={styles.stepperValue}>
          {value}
        </ThemedText>
        <Pressable
          style={[
            styles.stepperButton,
            { 
              backgroundColor: value < max ? theme.primary + "20" : theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
          onPress={() => {
            if (value < max) {
              onValueChange(value + 1);
              Haptics.selectionAsync();
            }
          }}
          disabled={value >= max}
        >
          <Feather 
            name="plus" 
            size={18} 
            color={value < max ? theme.primary : theme.textSecondary} 
          />
        </Pressable>
      </View>
    </View>
  );

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="users" size={24} color={theme.primary} />
          </View>
          <View style={styles.headerText}>
            <ThemedText type="heading">Your Family</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Help us personalize spending insights
            </ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        <NumberStepper
          label="Adults"
          sublabel="Age 18+"
          value={numAdults}
          onValueChange={setNumAdults}
          min={1}
          max={6}
        />

        <NumberStepper
          label="Toddlers & Preschoolers"
          sublabel="Under 5 years"
          value={numKidsUnder5}
          onValueChange={setNumKidsUnder5}
        />

        <NumberStepper
          label="Kids"
          sublabel="Ages 5-12"
          value={numKids5to12}
          onValueChange={setNumKids5to12}
        />

        <NumberStepper
          label="Teenagers"
          sublabel="Ages 13-17"
          value={numTeens}
          onValueChange={setNumTeens}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.iconContainer, { backgroundColor: theme.accent + "20" }]}>
            <Feather name="map-pin" size={24} color={theme.accent} />
          </View>
          <View style={styles.headerText}>
            <ThemedText type="heading">Location</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              For regional spending benchmarks
            </ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldRow}>
          <ThemedText type="body">City</ThemedText>
          <TextInput
            style={[styles.textInput, { color: theme.text, borderColor: theme.border }]}
            value={city}
            onChangeText={setCity}
            placeholder="Your city (optional)"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <View style={styles.fieldRow}>
          <ThemedText type="body">Country</ThemedText>
          <View style={styles.countryButtons}>
            {["US", "CA", "UK", "Other"].map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.countryButton,
                  {
                    backgroundColor: country === c ? theme.accent + "20" : theme.backgroundDefault,
                    borderColor: country === c ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => {
                  setCountry(c);
                  Haptics.selectionAsync();
                }}
              >
                <ThemedText 
                  type="small" 
                  style={{ color: country === c ? theme.accent : theme.text }}
                >
                  {c}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
      </Card>

      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Family Size
          </ThemedText>
          <ThemedText type="heading">{totalFamilySize}</ThemedText>
        </View>
        <View style={styles.summaryRow}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Household Type
          </ThemedText>
          <ThemedText type="body">
            {hasKids ? "Family with children" : "Couple"}
          </ThemedText>
        </View>
      </Card>

      <ThemedText type="small" style={[styles.hint, { color: theme.textSecondary }]}>
        This information helps us show relevant spending comparisons. Families with kids naturally 
        spend more on snacks and entertainment - and that's totally normal.
      </ThemedText>

      <Button
        onPress={handleSave}
        disabled={saving}
        style={styles.saveButton}
      >
        {saving ? "Saving..." : "Save Family Profile"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: Spacing.lg,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  stepperLabel: {
    flex: 1,
    gap: 2,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stepperValue: {
    minWidth: 32,
    textAlign: "center",
  },
  fieldRow: {
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
  },
  countryButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  countryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  hint: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
  saveButton: {
    marginTop: Spacing.md,
  },
});
