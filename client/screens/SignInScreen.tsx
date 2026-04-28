/**
 * SignInScreen — BT editorial-fintech aesthetic.
 *
 * Spec §3 voice + §4.1 Home parity: paper background, breathing Tilly
 * mascot in a halo, Instrument Serif headline + italic accent, mono caps
 * labels, ink-bg primary button. Email/password + Apple + Google all
 * wired through the existing `useAuth` provider.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Text,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/context/AuthContext";
import { Tilly } from "@/bt/Tilly";
import {
  BT_THEMES,
  BT_DEFAULT_THEME,
  BTFonts,
  BTFontsByWeight,
  type BTTheme,
} from "@/bt/theme";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

type AuthMode = "signin" | "signup";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  // Sign-in lives outside BTContext (which BTApp owns), so we reach for the
  // bloom palette directly. It matches what BTApp renders on first load.
  const t = BT_THEMES[BT_DEFAULT_THEME];
  const { signInWithApple, signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    if (response?.type === "success") {
      handleGoogleSuccess(response.authentication);
    } else if (response?.type === "error") {
      setError("Google sign-in failed. Please try again.");
    }
  }, [response]);

  const handleGoogleSuccess = async (authentication: any) => {
    try {
      setLoading(true);
      setError(null);
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${authentication.accessToken}` } },
      );
      const userInfo = await userInfoResponse.json();
      await signInWithGoogle(
        userInfo.sub,
        userInfo.email || null,
        userInfo.name || null,
        authentication.idToken || authentication.accessToken,
      );
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithApple();
    } catch (err: any) {
      if (err?.code !== "ERR_REQUEST_CANCELED") {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password please.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password must be at least 6 characters.");
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
      setError(err.message || "Something went wrong. Try again?");
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
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 36,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Tilly t={t} size={108} halo />
          <Text
            style={[
              styles.label,
              { color: t.inkMute, fontFamily: BTFontsByWeight.mono700 },
            ]}
          >
            HI.
          </Text>
          <Text
            style={[
              styles.headline,
              { color: t.ink, fontFamily: BTFonts.serif },
            ]}
          >
            I'm{" "}
            <Text
              style={{
                color: t.accent,
                fontStyle: "italic",
                fontFamily: BTFonts.serif,
              }}
            >
              Tilly
            </Text>
            .
          </Text>
          <Text
            style={[
              styles.sub,
              { color: t.inkSoft, fontFamily: BTFonts.serif },
            ]}
          >
            Money is already complicated. I'll do the watching so you don't
            have to.
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: t.accentSoft, borderColor: t.bad },
              ]}
            >
              <Text
                style={{
                  color: t.bad,
                  fontFamily: BTFonts.serif,
                  fontSize: 14,
                  fontStyle: "italic",
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          {mode === "signup" ? (
            <Field
              t={t}
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Maya"
              autoCapitalize="words"
              testID="input-name"
            />
          ) : null}
          <Field
            t={t}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            testID="input-email"
          />
          <Field
            t={t}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoCapitalize="none"
            testID="input-password"
          />

          <Pressable
            onPress={handleEmailAuth}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={mode === "signin" ? "Sign In" : "Create Account"}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: loading ? t.surfaceAlt : t.ink,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            testID="button-email-auth"
          >
            <Text
              style={{
                color: loading ? t.inkMute : t.surface,
                fontFamily: BTFontsByWeight.sans700,
                fontSize: 14,
                letterSpacing: 0.2,
              }}
            >
              {loading ? "One sec…" : mode === "signin" ? "Sign in" : "Create account"}
            </Text>
          </Pressable>

          <Pressable onPress={toggleMode} style={styles.toggleMode}>
            <Text
              style={{
                color: t.inkSoft,
                fontFamily: BTFonts.sans,
                fontSize: 13,
              }}
            >
              {mode === "signin" ? "New here? " : "Already have an account? "}
              <Text
                style={{
                  color: t.accent,
                  fontFamily: BTFontsByWeight.sans600,
                }}
              >
                {mode === "signin" ? "Make an account" : "Sign in"}
              </Text>
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: t.rule }]} />
            <Text
              style={[
                styles.dividerText,
                { color: t.inkMute, fontFamily: BTFontsByWeight.mono700 },
              ]}
            >
              OR CONTINUE WITH
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: t.rule }]} />
          </View>

          <View style={styles.socialButtons}>
            {Platform.OS === "ios" ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.socialButton}
                onPress={handleAppleSignIn}
              />
            ) : (
              <Pressable
                onPress={handleAppleSignIn}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Continue with Apple"
                style={({ pressed }) => [
                  styles.socialButtonAlt,
                  { backgroundColor: t.ink, opacity: pressed ? 0.85 : 1 },
                ]}
                testID="button-apple"
              >
                <Text
                  style={{
                    color: t.surface,
                    fontFamily: BTFontsByWeight.sans700,
                    fontSize: 13,
                  }}
                >
                  Apple
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => promptAsync()}
              disabled={loading || !request}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              style={({ pressed }) => [
                styles.socialButtonAlt,
                {
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.rule,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              testID="button-google"
            >
              <Text
                style={{
                  color: t.ink,
                  fontFamily: BTFontsByWeight.sans700,
                  fontSize: 13,
                }}
              >
                Google
              </Text>
            </Pressable>
          </View>

          <Text
            style={[
              styles.terms,
              { color: t.inkMute, fontFamily: BTFonts.sans },
            ]}
          >
            By continuing, you agree to the Terms and Privacy Policy. I'll
            never sell or share what you tell me.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  t,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  testID,
}: {
  t: BTTheme;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "words" | "sentences";
  autoComplete?: any;
  testID?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: t.inkMute,
          fontFamily: BTFontsByWeight.mono700,
          fontSize: 10,
          letterSpacing: 1.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.inkMute}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? "sentences"}
        autoComplete={autoComplete}
        testID={testID}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.rule,
          color: t.ink,
          fontFamily: BTFonts.sans,
          fontSize: 15,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 28, gap: 28 },
  hero: { alignItems: "center", gap: 12, marginBottom: 8 },
  label: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
  },
  headline: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "500",
    textAlign: "center",
  },
  sub: {
    fontSize: 16,
    lineHeight: 24,
    fontStyle: "italic",
    textAlign: "center",
    maxWidth: 320,
  },
  form: { gap: 14 },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  toggleMode: { alignItems: "center", paddingVertical: 8 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 10, letterSpacing: 1.4 },
  socialButtons: { flexDirection: "row", gap: 10 },
  socialButton: { flex: 1, height: 50 },
  socialButtonAlt: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  terms: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
