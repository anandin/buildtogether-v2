import React, { useState, useEffect } from "react";
import { View, StyleSheet, Platform, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Image } from "react-native";

import appLogo from "../../assets/images/icon.png";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

type AuthMode = "signin" | "signup";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { signInWithApple, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    if (response?.type === "success") {
      handleGoogleSuccess(response.authentication);
    } else if (response?.type === "error") {
      setError("Google sign in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [response]);

  const handleGoogleSuccess = async (authentication: any) => {
    try {
      setLoading(true);
      setError(null);
      
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${authentication.accessToken}` },
        }
      );
      
      const userInfo = await userInfoResponse.json();
      
      await signInWithGoogle(
        userInfo.sub,
        userInfo.email || null,
        userInfo.name || null,
        authentication.idToken || authentication.accessToken
      );
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Google sign in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await promptAsync();
    } catch (err: any) {
      setError("Google sign in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithApple();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError("Sign in failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password");
      return;
    }

    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (mode === "signin") {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(email.trim(), password, name.trim() || undefined);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setError(null);
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView 
        contentContainerStyle={[
          styles.container,
          { 
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.logoContainer, { backgroundColor: theme.primary + "15" }]}>
            <Image source={appLogo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <ThemedText type="h1" style={styles.title}>
            Build Together
          </ThemedText>
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            Your personal finance companion{"\n"}that learns what works for you
          </ThemedText>
        </View>

        <View style={styles.authSection}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.error + "15" }]}>
              <Feather name="alert-circle" size={16} color={theme.error} />
              <ThemedText type="small" style={[styles.errorText, { color: theme.error }]}>
                {error}
              </ThemedText>
            </View>
          ) : null}

          {mode === "signup" ? (
            <View style={styles.inputContainer}>
              <ThemedText type="small" style={[styles.inputLabel, { color: theme.textSecondary }]}>
                Name (optional)
              </ThemedText>
              <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                <Feather name="user" size={18} color={theme.textSecondary} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder="Your name"
                  placeholderTextColor={theme.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  testID="input-name"
                />
              </View>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <ThemedText type="small" style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Email
            </ThemedText>
            <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Feather name="mail" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="your@email.com"
                placeholderTextColor={theme.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                testID="input-email"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="small" style={[styles.inputLabel, { color: theme.textSecondary }]}>
              Password
            </ThemedText>
            <View style={[styles.inputWrapper, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
              <Feather name="lock" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Your password"
                placeholderTextColor={theme.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                testID="input-password"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={handleEmailAuth}
            disabled={loading}
            testID="button-email-auth"
          >
            <ThemedText type="body" style={styles.buttonText}>
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </ThemedText>
          </Pressable>

          <Pressable onPress={toggleMode} style={styles.toggleMode}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <ThemedText type="small" style={{ color: theme.primary, fontWeight: "600" }}>
                {mode === "signin" ? "Sign Up" : "Sign In"}
              </ThemedText>
            </ThemedText>
          </Pressable>

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <ThemedText type="small" style={[styles.dividerText, { color: theme.textSecondary }]}>
              or continue with
            </ThemedText>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <View style={styles.socialButtons}>
            {Platform.OS === "ios" ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={BorderRadius.md}
                style={styles.socialButton}
                onPress={handleAppleSignIn}
              />
            ) : (
              <Pressable
                style={[styles.socialButtonAlt, { backgroundColor: "#000" }]}
                onPress={handleAppleSignIn}
                disabled={loading}
                testID="button-apple"
              >
                <Feather name="smartphone" size={20} color="#FFFFFF" />
                <ThemedText type="body" style={styles.buttonText}>
                  Apple
                </ThemedText>
              </Pressable>
            )}

            <Pressable
              style={[styles.socialButtonAlt, { backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border }]}
              onPress={handleGoogleSignIn}
              disabled={loading || !request}
              testID="button-google"
            >
              <View style={styles.googleIcon}>
                <ThemedText style={{ fontSize: 16, fontWeight: "bold", color: "#4285F4" }}>G</ThemedText>
              </View>
              <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
                Google
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="tiny" style={[styles.terms, { color: theme.textSecondary }]}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </ThemedText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 24,
  },
  authSection: {
    flex: 1,
    gap: Spacing.md,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  errorText: {
    flex: 1,
  },
  inputContainer: {
    gap: Spacing.xs,
  },
  inputLabel: {
    marginLeft: Spacing.xs,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Nunito_400Regular",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 50,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  toggleMode: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginVertical: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: 1,
  },
  socialButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  socialButton: {
    flex: 1,
    height: 50,
  },
  socialButtonAlt: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 50,
    borderRadius: BorderRadius.md,
  },
  googleIcon: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  terms: {
    textAlign: "center",
    lineHeight: 18,
    marginTop: Spacing.md,
  },
});
