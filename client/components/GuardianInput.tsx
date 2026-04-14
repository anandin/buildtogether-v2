import React, { useState, useRef, useMemo } from "react";
import { View, TextInput, StyleSheet, Pressable, ActivityIndicator, Platform, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

import dreamGuardianIcon from "../../assets/images/dream-guardian-icon.png";

interface Props {
  onSubmit: (text: string) => void;
  onCameraPress?: () => void;
  isProcessing: boolean;
  placeholder?: string;
}

// Rotating hints so the input feels alive instead of a static search box.
const PLACEHOLDERS = [
  "Tell me about a purchase…",
  "What did you spend today?",
  "Anything to log? Just type it naturally.",
  "Log an expense, ask me a question…",
  "Try: coffee $5 at starbucks",
];

export function GuardianInput({ onSubmit, onCameraPress, isProcessing, placeholder }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const { theme } = useTheme();

  // Pick a stable rotating placeholder per mount so it changes across visits
  // but doesn't flicker mid-session.
  const dynamicPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    const idx = Math.floor(Date.now() / 60000) % PLACEHOLDERS.length;
    return PLACEHOLDERS[idx];
  }, [placeholder]);

  const handleSubmit = () => {
    if (!text.trim() || isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(text.trim());
    setText("");
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={[styles.inputRow, { backgroundColor: theme.backgroundSecondary }]}>
        {/* Guardian owl avatar — the presence signal */}
        <View style={[styles.avatarWrap, { backgroundColor: theme.aiLight }]}>
          <Image source={dreamGuardianIcon} style={styles.avatar} />
        </View>

        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          value={text}
          onChangeText={setText}
          placeholder={dynamicPlaceholder}
          placeholderTextColor={theme.textTertiary}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!isProcessing}
          multiline={false}
        />

        {onCameraPress && !text.trim() ? (
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCameraPress();
            }}
            disabled={isProcessing}
            accessibilityLabel="Scan receipt"
          >
            <Feather name="camera" size={20} color={theme.textTertiary} />
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.sendButton,
            {
              backgroundColor: text.trim() && !isProcessing ? theme.primary : "transparent",
              borderColor: text.trim() && !isProcessing ? theme.primary : theme.border,
            },
          ]}
          onPress={handleSubmit}
          disabled={!text.trim() || isProcessing}
          accessibilityLabel="Send to Guardian"
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Feather
              name="arrow-up"
              size={18}
              color={text.trim() ? "#FFFFFF" : theme.textTertiary}
            />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Platform.select({ ios: Spacing.xs, android: Spacing.sm }),
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.xs,
    gap: Spacing.xs,
    minHeight: 48,
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.select({ ios: Spacing.sm, android: Spacing.sm }),
    paddingHorizontal: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
