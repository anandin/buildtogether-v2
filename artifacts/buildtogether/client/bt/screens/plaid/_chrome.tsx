/**
 * Shared sub-screen header — back button + centred title + optional right
 * accessory. Used by every drill-down screen mounted under BTProfile.
 */
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBT } from "../../BTContext";
import { BTFonts } from "../../theme";

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const { t } = useBT();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: Math.max(insets.top, 8),
        paddingHorizontal: 14,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.rule,
        backgroundColor: t.bg,
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? t.chip : "transparent",
        })}
      >
        <Feather name="chevron-left" size={22} color={t.ink} />
      </Pressable>
      <Text
        style={{
          flex: 1,
          color: t.ink,
          fontFamily: BTFonts.mono,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ? <View>{right}</View> : null}
    </View>
  );
}
