/**
 * Terms of Service Screen
 * Legal terms and conditions for SideBet
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface TermsOfServiceScreenProps {
  onClose: () => void;
}

export const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({ onClose }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Terms of Service" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.effectiveDate}>Effective Date: January 1, 2025</Text>
          <Text style={styles.intro}>
            Welcome to SideBet. By accessing or using our mobile application, you agree to be bound by these Terms of Service. Please read them carefully.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By creating an account or using SideBet, you agree to these Terms of Service, our Privacy Policy, and our Community Guidelines. If you do not agree, you may not use our services.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Eligibility</Text>
          <Text style={styles.paragraph}>
            You must be at least 18 years of age to use SideBet. By using the app, you represent and warrant that:
          </Text>
          <Text style={styles.bulletPoint}>• You are 18 years of age or older</Text>
          <Text style={styles.bulletPoint}>• You have the legal capacity to enter into binding contracts</Text>
          <Text style={styles.bulletPoint}>• You are not prohibited by law from using our services</Text>
          <Text style={styles.bulletPoint}>• All information you provide is accurate and current</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Account Registration and Security</Text>
          <Text style={styles.paragraph}>
            To use SideBet, you must create an account. You agree to:
          </Text>
          <Text style={styles.bulletPoint}>• Provide accurate and complete registration information</Text>
          <Text style={styles.bulletPoint}>• Maintain the security of your account credentials</Text>
          <Text style={styles.bulletPoint}>• Notify us immediately of any unauthorized access</Text>
          <Text style={styles.bulletPoint}>• Be responsible for all activity under your account</Text>
          <Text style={styles.bulletPoint}>• Not share your account with others</Text>
          <Text style={styles.paragraph}>
            We reserve the right to suspend or terminate accounts that violate these terms or engage in fraudulent activity.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. How SideBet Works</Text>
          <Text style={styles.paragraph}>
            SideBet is a peer-to-peer betting platform where users can create, join, and resolve friendly wagers with friends:
          </Text>

          <Text style={styles.subsectionTitle}>Creating Bets</Text>
          <Text style={styles.bulletPoint}>• Users can create custom bets with two sides (e.g., Team A vs Team B)</Text>
          <Text style={styles.bulletPoint}>• Bet creators set the amount and invite friends to participate</Text>
          <Text style={styles.bulletPoint}>• All participants must agree to the bet terms before joining</Text>

          <Text style={styles.subsectionTitle}>Joining Bets</Text>
          <Text style={styles.bulletPoint}>• Users can join active bets created by friends</Text>
          <Text style={styles.bulletPoint}>• Joining a bet deducts the bet amount from your account balance</Text>
          <Text style={styles.bulletPoint}>• Once joined, bets cannot be cancelled unless the creator cancels the entire bet</Text>

          <Text style={styles.subsectionTitle}>Bet Resolution</Text>
          <Text style={styles.bulletPoint}>• Only the bet creator can determine the winning side</Text>
          <Text style={styles.bulletPoint}>• Payouts are automatically distributed to winners</Text>
          <Text style={styles.bulletPoint}>• A 3% platform fee is deducted from winnings before distribution</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Account Balance and Transactions</Text>

          <Text style={styles.subsectionTitle}>Deposits</Text>
          <Text style={styles.bulletPoint}>• You can add funds to your account via Venmo</Text>
          <Text style={styles.bulletPoint}>• All deposits require admin verification before being credited</Text>
          <Text style={styles.bulletPoint}>• You must provide valid Venmo transaction details</Text>
          <Text style={styles.bulletPoint}>• Fraudulent deposit attempts will result in account termination</Text>

          <Text style={styles.subsectionTitle}>Withdrawals</Text>
          <Text style={styles.bulletPoint}>• You can withdraw funds to your verified Venmo account</Text>
          <Text style={styles.bulletPoint}>• Withdrawals are processed manually by our admin team</Text>
          <Text style={styles.bulletPoint}>• Processing may take 1-5 business days</Text>
          <Text style={styles.bulletPoint}>• Minimum withdrawal amount may apply</Text>
          <Text style={styles.bulletPoint}>• A 2% processing fee is deducted from withdrawal amounts</Text>

          <Text style={styles.subsectionTitle}>Platform Fees</Text>
          <Text style={styles.bulletPoint}>• Winnings Fee: 3% of bet winnings are retained as a platform fee</Text>
          <Text style={styles.bulletPoint}>• Withdrawal Fee: 2% of withdrawal amounts are retained as a processing fee</Text>
          <Text style={styles.bulletPoint}>• No fees are charged for deposits or placing bets</Text>
          <Text style={styles.bulletPoint}>• Fees support platform maintenance, security, and customer support</Text>

          <Text style={styles.subsectionTitle}>Account Balance</Text>
          <Text style={styles.bulletPoint}>• Your balance reflects available funds for betting</Text>
          <Text style={styles.bulletPoint}>• Balances are held in your SideBet account, not with Venmo</Text>
          <Text style={styles.bulletPoint}>• SideBet LLC maintains custody of all user funds</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. User Responsibilities</Text>
          <Text style={styles.paragraph}>
            You agree to use SideBet responsibly and in compliance with all applicable laws. You will not:
          </Text>
          <Text style={styles.bulletPoint}>• Use SideBet for illegal gambling or activities prohibited by law</Text>
          <Text style={styles.bulletPoint}>• Create bets involving minors, illegal activities, or violence</Text>
          <Text style={styles.bulletPoint}>• Engage in fraud, cheating, or manipulation of bet outcomes</Text>
          <Text style={styles.bulletPoint}>• Harass, threaten, or abuse other users</Text>
          <Text style={styles.bulletPoint}>• Attempt to gain unauthorized access to our systems</Text>
          <Text style={styles.bulletPoint}>• Use automated systems or bots to interact with the app</Text>
          <Text style={styles.bulletPoint}>• Create multiple accounts to circumvent restrictions</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Dispute Resolution</Text>
          <Text style={styles.paragraph}>
            If a dispute arises regarding a bet outcome:
          </Text>
          <Text style={styles.bulletPoint}>• Users should first attempt to resolve disputes directly</Text>
          <Text style={styles.bulletPoint}>• The bet creator has final authority on bet outcomes</Text>
          <Text style={styles.bulletPoint}>• SideBet may mediate disputes at our discretion but is not obligated to do so</Text>
          <Text style={styles.bulletPoint}>• Our decisions regarding disputes are final and binding</Text>
          <Text style={styles.paragraph}>
            SideBet is a platform for friendly betting and is not responsible for disputes between users.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
          <Text style={styles.paragraph}>
            All content, features, and functionality of SideBet are owned by SideBet LLC and are protected by copyright, trademark, and other intellectual property laws. You may not:
          </Text>
          <Text style={styles.bulletPoint}>• Copy, modify, or distribute our app or content</Text>
          <Text style={styles.bulletPoint}>• Reverse engineer or decompile the app</Text>
          <Text style={styles.bulletPoint}>• Use our trademarks or branding without permission</Text>
          <Text style={styles.bulletPoint}>• Create derivative works based on our services</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Disclaimer of Warranties</Text>
          <Text style={styles.paragraph}>
            SIDEBET IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THAT:
          </Text>
          <Text style={styles.bulletPoint}>• The app will be error-free or uninterrupted</Text>
          <Text style={styles.bulletPoint}>• Defects will be corrected</Text>
          <Text style={styles.bulletPoint}>• The app is free from viruses or harmful components</Text>
          <Text style={styles.bulletPoint}>• Results obtained from using the app will be accurate or reliable</Text>
          <Text style={styles.paragraph}>
            You use SideBet at your own risk.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SIDEBET LLC SHALL NOT BE LIABLE FOR:
          </Text>
          <Text style={styles.bulletPoint}>• Indirect, incidental, or consequential damages</Text>
          <Text style={styles.bulletPoint}>• Loss of profits, data, or goodwill</Text>
          <Text style={styles.bulletPoint}>• Damages arising from disputes between users</Text>
          <Text style={styles.bulletPoint}>• Unauthorized access to your account or data</Text>
          <Text style={styles.bulletPoint}>• Actions or omissions of third-party payment providers</Text>
          <Text style={styles.paragraph}>
            Our total liability shall not exceed the amount you paid to SideBet in the 12 months preceding the claim.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Indemnification</Text>
          <Text style={styles.paragraph}>
            You agree to indemnify and hold harmless SideBet LLC, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from:
          </Text>
          <Text style={styles.bulletPoint}>• Your violation of these Terms of Service</Text>
          <Text style={styles.bulletPoint}>• Your use or misuse of the app</Text>
          <Text style={styles.bulletPoint}>• Your violation of any law or rights of a third party</Text>
          <Text style={styles.bulletPoint}>• Disputes with other users</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>12. Termination</Text>
          <Text style={styles.paragraph}>
            We reserve the right to suspend or terminate your account at any time for:
          </Text>
          <Text style={styles.bulletPoint}>• Violation of these Terms of Service</Text>
          <Text style={styles.bulletPoint}>• Fraudulent or illegal activity</Text>
          <Text style={styles.bulletPoint}>• Abuse of other users or our systems</Text>
          <Text style={styles.bulletPoint}>• Any reason at our sole discretion</Text>
          <Text style={styles.paragraph}>
            Upon termination, you may withdraw any remaining balance subject to verification. We are not liable for any losses resulting from account termination.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>13. Governing Law and Jurisdiction</Text>
          <Text style={styles.paragraph}>
            These Terms are governed by the laws of the United States. Any disputes shall be resolved in the appropriate courts, and you consent to personal jurisdiction in such courts.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>14. Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We may modify these Terms of Service at any time. We will notify you of material changes by posting the updated terms in the app and updating the "Effective Date" above. Your continued use of SideBet after changes constitutes acceptance of the updated terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>15. Severability</Text>
          <Text style={styles.paragraph}>
            If any provision of these Terms is found to be unenforceable or invalid, that provision shall be modified to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>16. Contact Information</Text>
          <Text style={styles.paragraph}>
            If you have questions about these Terms of Service, please contact us through the Support section in the app.
          </Text>
          <Text style={styles.paragraph}>
            SideBet LLC{'\n'}
            Terms of Service Inquiries
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
