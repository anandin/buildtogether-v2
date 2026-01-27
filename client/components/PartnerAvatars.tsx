import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { Partner } from "@/types";

interface PartnerAvatarsProps {
  partner1: Partner;
  partner2: Partner;
  size?: number;
}

const avatarImages: Record<string, any> = {
  "avatar-preset-1": require("../../assets/images/avatar-preset-1.png"),
  "avatar-preset-2": require("../../assets/images/avatar-preset-2.png"),
};

export function PartnerAvatars({
  partner1,
  partner2,
  size = 36,
}: PartnerAvatarsProps) {
  const { theme } = useTheme();
  const overlap = size * 0.3;

  return (
    <View style={styles.container}>
      <Image
        source={avatarImages[partner1.avatar] || avatarImages["avatar-preset-1"]}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: theme.backgroundRoot,
          },
        ]}
      />
      <Image
        source={avatarImages[partner2.avatar] || avatarImages["avatar-preset-2"]}
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: theme.backgroundRoot,
            marginLeft: -overlap,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    borderWidth: 2,
  },
});
