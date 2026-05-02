import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export default function TermsOfServiceScreen() {
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
        Terms of Service
      </ThemedText>
      <ThemedText type="tiny" style={[styles.date, { color: theme.textSecondary }]}>
        Last updated: January 2026
      </ThemedText>

      <Section title="Acceptance of Terms">
        By using Build Together ("the App"), you agree to these Terms of Service. If you do not agree, please do not use the App.
      </Section>

      <Section title="Description of Service">
        Build Together is a personal finance app designed for couples to track shared expenses, manage budgets, and save toward common goals. The App is for personal, non-commercial use only.
      </Section>

      <Section title="Account Registration">
        {`To use the App, you must:

- Sign in using Apple Sign-In or another supported authentication method
- Be at least 18 years old
- Provide accurate information
- Keep your account credentials secure`}
      </Section>

      <Section title="User Responsibilities">
        {`You agree to:

- Use the App only for lawful purposes
- Not misuse or attempt to gain unauthorized access to the App
- Not share your account with anyone other than your linked partner
- Ensure data you enter is accurate to the best of your knowledge`}
      </Section>

      <Section title="Partner Linking">
        {`The App allows you to link with one partner:

- Both partners have equal access to shared data
- Either partner can view, edit, and delete shared expenses and goals
- You are responsible for linking only with trusted individuals`}
      </Section>

      <Section title="AI Features">
        {`The App uses AI to provide insights and suggestions:

- AI features are for informational purposes only
- We do not guarantee the accuracy of AI-generated insights
- AI is not a substitute for professional financial advice`}
      </Section>

      <Section title="Intellectual Property">
        All content, features, and functionality of the App are owned by Build Together and are protected by copyright, trademark, and other laws.
      </Section>

      <Section title="Disclaimer of Warranties">
        The App is provided "as is" without warranties of any kind. We do not guarantee the App will be error-free, secure, or continuously available.
      </Section>

      <Section title="Limitation of Liability">
        To the maximum extent permitted by law, Build Together shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App.
      </Section>

      <Section title="Changes to Terms">
        We may update these Terms from time to time. Continued use of the App after changes constitutes acceptance of the new Terms.
      </Section>

      <Section title="Termination">
        We reserve the right to suspend or terminate your access to the App at any time for violation of these Terms or for any other reason.
      </Section>

      <Section title="Contact">
        For questions about these Terms, contact us at support@buildtogether.app
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
