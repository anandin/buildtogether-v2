import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <ThemedText type="h3" style={styles.title}>
        Privacy Policy
      </ThemedText>
      <ThemedText type="tiny" style={[styles.date, { color: theme.textSecondary }]}>
        Last updated: January 2026
      </ThemedText>

      <Section title="Overview">
        Build Together ("the App") is a couples finance app that helps partners manage shared expenses and savings goals. Your privacy is important to us, and this policy explains how we collect, use, and protect your information.
      </Section>

      <Section title="Information We Collect">
        {`We collect the following types of information:

- Account Information: Your Apple ID or Google account information used to sign in, including your name and email address.

- Financial Data: Expense entries, savings goals, budgets, and receipt images you upload. This data is stored securely and shared only with your linked partner.

- Usage Data: How you interact with the app to improve our service.`}
      </Section>

      <Section title="How We Use Your Information">
        {`Your data is used to:

- Provide the core app functionality (expense tracking, goal management)
- Sync data between you and your partner
- Generate AI-powered insights to help you save money
- Improve our app and services`}
      </Section>

      <Section title="Data Sharing">
        {`We do not sell your personal information. Your financial data is:

- Shared only with your linked partner
- Processed by OpenAI for AI features (anonymized where possible)
- Never shared with advertisers or third parties for marketing`}
      </Section>

      <Section title="Data Security">
        {`We protect your data using:

- Secure encrypted connections (HTTPS)
- Encrypted database storage
- Secure authentication via Apple Sign-In`}
      </Section>

      <Section title="Data Retention">
        Your data is retained as long as you have an active account. You can request deletion of your account and all associated data by contacting us.
      </Section>

      <Section title="Your Rights">
        {`You have the right to:

- Access your personal data
- Correct inaccurate data
- Request deletion of your data
- Export your data`}
      </Section>

      <Section title="Contact Us">
        If you have questions about this privacy policy, please contact us at support@buildtogether.app
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="heading" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, lineHeight: 24 }}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  date: {
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
});
