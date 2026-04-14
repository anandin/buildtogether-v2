import React, { useState, useRef } from "react";
import { View, TextInput, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";

interface Props {
  onSubmit: (text: string) => void;
  onCameraPress?: () => void;
  isProcessing: boolean;
  placeholder?: string;
}

export function GuardianInput({ onSubmit, onCameraPress, isProcessing, placeholder }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const { theme } = useTheme();

  const handleSubmit = () => {
    if (!text.trim() || isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(text.trim());
    setText("");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={[styles.inputRow, { backgroundColor: theme.background }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder || "Tell me about a purchase..."}
          placeholderTextColor={theme.textTertiary}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!isProcessing}
          multiline={false}
        />

        {onCameraPress && (
          <Pressable
            style={[styles.iconButton]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCameraPress();
            }}
            disabled={isProcessing}
          >
            <Feather name="camera" size={20} color={theme.textTertiary} />
          </Pressable>
        )}

        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor: text.trim() && !isProcessing ? theme.primary : theme.border,
            },
          ]}
          onPress={handleSubmit}
          disabled={!text.trim() || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="arrow-up" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.select({ ios: Spacing.xs, android: Spacing.sm }),
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    gap: Spacing.xs,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.select({ ios: Spacing.sm, android: Spacing.sm }),
  },
  iconButton: {
    padding: Spacing.sm,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
