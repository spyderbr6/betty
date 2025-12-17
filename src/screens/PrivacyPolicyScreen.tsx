/**
 * Privacy Policy Screen
 * GDPR-compliant privacy policy for SideBet
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface PrivacyPolicyScreenProps {
  onClose: () => void;
}

export const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({ onClose }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Privacy Policy" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.effectiveDate}>Effective Date: January 1, 2025</Text>
          <Text style={styles.intro}>
            SideBet LLC ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Information We Collect</Text>

          <Text style={styles.subsectionTitle}>Personal Information</Text>
          <Text style={styles.paragraph}>
            We collect information that you provide directly to us, including:
          </Text>
          <Text style={styles.bulletPoint}>• Email address (required for account creation)</Text>
          <Text style={styles.bulletPoint}>• Display name (optional)</Text>
          <Text style={styles.bulletPoint}>• Profile picture (optional)</Text>
          <Text style={styles.bulletPoint}>• Payment information (Venmo username, email, or phone number)</Text>

          <Text style={styles.subsectionTitle}>Betting Activity Data</Text>
          <Text style={styles.paragraph}>
            We automatically collect information about your betting activities:
          </Text>
          <Text style={styles.bulletPoint}>• Bets created and joined</Text>
          <Text style={styles.bulletPoint}>• Bet outcomes and resolutions</Text>
          <Text style={styles.bulletPoint}>• Transaction history (deposits, withdrawals, winnings)</Text>
          <Text style={styles.bulletPoint}>• Account balance and payment methods</Text>
          <Text style={styles.bulletPoint}>• Friend connections and interactions</Text>

          <Text style={styles.subsectionTitle}>Device and Usage Information</Text>
          <Text style={styles.paragraph}>
            We collect information about how you access and use the app:
          </Text>
          <Text style={styles.bulletPoint}>• Device type and operating system</Text>
          <Text style={styles.bulletPoint}>• App version and settings</Text>
          <Text style={styles.bulletPoint}>• Push notification tokens</Text>
          <Text style={styles.bulletPoint}>• Log data and error reports</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use the information we collect to:
          </Text>
          <Text style={styles.bulletPoint}>• Provide, maintain, and improve our services</Text>
          <Text style={styles.bulletPoint}>• Process and manage your bets and transactions</Text>
          <Text style={styles.bulletPoint}>• Facilitate payments and withdrawals</Text>
          <Text style={styles.bulletPoint}>• Send you notifications about bet activity and account updates</Text>
          <Text style={styles.bulletPoint}>• Detect and prevent fraud, abuse, and security incidents</Text>
          <Text style={styles.bulletPoint}>• Comply with legal obligations and enforce our Terms of Service</Text>
          <Text style={styles.bulletPoint}>• Respond to your support requests and feedback</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Information Sharing and Disclosure</Text>
          <Text style={styles.paragraph}>
            We do not sell your personal information. We may share your information in the following circumstances:
          </Text>

          <Text style={styles.subsectionTitle}>With Other Users</Text>
          <Text style={styles.bulletPoint}>• Display name and profile picture are visible to friends and bet participants</Text>
          <Text style={styles.bulletPoint}>• Betting activity is visible to other participants in the same bets</Text>

          <Text style={styles.subsectionTitle}>Service Providers</Text>
          <Text style={styles.bulletPoint}>• AWS (cloud hosting and database services)</Text>
          <Text style={styles.bulletPoint}>• Expo (push notification delivery)</Text>
          <Text style={styles.bulletPoint}>• Payment processors (for verifying Venmo transactions)</Text>

          <Text style={styles.subsectionTitle}>Legal Requirements</Text>
          <Text style={styles.paragraph}>
            We may disclose your information if required by law, legal process, or to protect the rights, property, or safety of SideBet, our users, or others.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Data Storage and Security</Text>
          <Text style={styles.paragraph}>
            Your data is stored securely using AWS Amplify and Amazon Web Services infrastructure:
          </Text>
          <Text style={styles.bulletPoint}>• Data is encrypted in transit using HTTPS/TLS</Text>
          <Text style={styles.bulletPoint}>• Data is encrypted at rest in AWS databases</Text>
          <Text style={styles.bulletPoint}>• Authentication is managed through AWS Cognito</Text>
          <Text style={styles.bulletPoint}>• Access controls limit data access to authorized users only</Text>
          <Text style={styles.paragraph}>
            While we implement industry-standard security measures, no system is completely secure. You are responsible for maintaining the confidentiality of your account credentials.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Your Privacy Rights</Text>
          <Text style={styles.paragraph}>
            Depending on your location, you may have the following rights:
          </Text>
          <Text style={styles.bulletPoint}>• Access: Request a copy of your personal data</Text>
          <Text style={styles.bulletPoint}>• Correction: Update or correct inaccurate information</Text>
          <Text style={styles.bulletPoint}>• Deletion: Request deletion of your account and data</Text>
          <Text style={styles.bulletPoint}>• Portability: Receive your data in a machine-readable format</Text>
          <Text style={styles.bulletPoint}>• Opt-out: Disable push notifications in app settings</Text>

          <Text style={styles.paragraph}>
            To exercise these rights, contact us through the Support section in the app. We will respond to your request within 30 days.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Data Retention</Text>
          <Text style={styles.paragraph}>
            We retain your information for as long as your account is active or as needed to provide services. After account deletion:
          </Text>
          <Text style={styles.bulletPoint}>• Personal information is deleted within 90 days</Text>
          <Text style={styles.bulletPoint}>• Transaction records may be retained for 7 years for legal compliance</Text>
          <Text style={styles.bulletPoint}>• Aggregated, anonymized data may be retained indefinitely</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Children's Privacy</Text>
          <Text style={styles.paragraph}>
            SideBet is only available to users 18 years of age or older. We do not knowingly collect information from anyone under 18. If we discover that a user under 18 has provided personal information, we will delete it immediately.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. International Data Transfers</Text>
          <Text style={styles.paragraph}>
            Your information may be transferred to and processed in countries other than your own. By using SideBet, you consent to the transfer of your information to the United States and other countries where our service providers operate.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Third-Party Services</Text>
          <Text style={styles.paragraph}>
            SideBet integrates with third-party payment services (Venmo). We are not responsible for the privacy practices of these third parties. Please review their privacy policies before using their services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Changes to This Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy in the app and updating the "Effective Date" above. Your continued use of SideBet after changes constitutes acceptance of the updated policy.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions about this Privacy Policy or our data practices, please contact us through the Support section in the app.
          </Text>
          <Text style={styles.paragraph}>
            SideBet LLC{'\n'}
            Privacy Policy Inquiries
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © 2025 SideBet LLC. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  effectiveDate: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  intro: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  subsectionTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  paragraph: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  bulletPoint: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xs / 2,
    paddingLeft: spacing.sm,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  footerText: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
