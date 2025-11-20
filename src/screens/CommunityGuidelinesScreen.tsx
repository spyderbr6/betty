/**
 * Community Guidelines Screen
 * Conduct rules and betting ethics for SideBet
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';

interface CommunityGuidelinesScreenProps {
  onClose: () => void;
}

export const CommunityGuidelinesScreen: React.FC<CommunityGuidelinesScreenProps> = ({ onClose }) => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Community Guidelines" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.effectiveDate}>Effective Date: January 1, 2025</Text>
          <Text style={styles.intro}>
            SideBet is a platform for friendly, peer-to-peer betting among friends. These Community Guidelines help ensure a safe, fair, and enjoyable experience for everyone.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Core Principles</Text>
          <Text style={styles.paragraph}>
            Our community is built on trust, fairness, and respect. We expect all users to:
          </Text>
          <Text style={styles.bulletPoint}>• Act with honesty and integrity</Text>
          <Text style={styles.bulletPoint}>• Treat other users with respect and kindness</Text>
          <Text style={styles.bulletPoint}>• Honor your betting commitments</Text>
          <Text style={styles.bulletPoint}>• Resolve disputes fairly and constructively</Text>
          <Text style={styles.bulletPoint}>• Follow all applicable laws and regulations</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Fair Betting Practices</Text>

          <Text style={styles.subsectionTitle}>Creating Bets</Text>
          <Text style={styles.bulletPoint}>• Create bets with clear, unambiguous terms</Text>
          <Text style={styles.bulletPoint}>• Ensure bet outcomes can be objectively determined</Text>
          <Text style={styles.bulletPoint}>• Do not create bets designed to deceive or mislead</Text>
          <Text style={styles.bulletPoint}>• Set reasonable expiration dates</Text>
          <Text style={styles.bulletPoint}>• Be available to resolve bets promptly after outcomes are known</Text>

          <Text style={styles.subsectionTitle}>Joining Bets</Text>
          <Text style={styles.bulletPoint}>• Only join bets you understand and can afford</Text>
          <Text style={styles.bulletPoint}>• Read bet terms carefully before committing</Text>
          <Text style={styles.bulletPoint}>• Do not attempt to manipulate bet outcomes</Text>
          <Text style={styles.bulletPoint}>• Honor your commitment once you join a bet</Text>

          <Text style={styles.subsectionTitle}>Resolving Bets</Text>
          <Text style={styles.bulletPoint}>• Resolve bets honestly based on actual outcomes</Text>
          <Text style={styles.bulletPoint}>• Do not delay resolution to avoid paying winners</Text>
          <Text style={styles.bulletPoint}>• Provide evidence if requested to support resolution</Text>
          <Text style={styles.bulletPoint}>• Cancel bets only when appropriate (e.g., event cancelled)</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Prohibited Bet Types</Text>
          <Text style={styles.paragraph}>
            The following types of bets are strictly prohibited on SideBet:
          </Text>
          <Text style={styles.bulletPoint}>• Bets involving illegal activities or criminal conduct</Text>
          <Text style={styles.bulletPoint}>• Bets on violence, harm, or injury to people or animals</Text>
          <Text style={styles.bulletPoint}>• Bets involving minors or their activities</Text>
          <Text style={styles.bulletPoint}>• Bets on the death, illness, or suffering of individuals</Text>
          <Text style={styles.bulletPoint}>• Bets that violate privacy or involve harassment</Text>
          <Text style={styles.bulletPoint}>• Bets on regulated professional sports events (where prohibited by law)</Text>
          <Text style={styles.bulletPoint}>• Bets where the outcome can be controlled by a participant</Text>
          <Text style={styles.bulletPoint}>• Bets involving discriminatory or hateful content</Text>
          <Text style={styles.bulletPoint}>• Bets designed to circumvent terms of service</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Acceptable Bet Examples</Text>
          <Text style={styles.paragraph}>
            SideBet is designed for friendly, personal wagers such as:
          </Text>
          <Text style={styles.bulletPoint}>• Sports outcomes among friends (where legally permitted)</Text>
          <Text style={styles.bulletPoint}>• Personal challenges (weight loss goals, fitness milestones)</Text>
          <Text style={styles.bulletPoint}>• Game scores or tournament brackets</Text>
          <Text style={styles.bulletPoint}>• Movie box office predictions</Text>
          <Text style={styles.bulletPoint}>• Award show winners or nominees</Text>
          <Text style={styles.bulletPoint}>• Weather conditions or temperature predictions</Text>
          <Text style={styles.bulletPoint}>• Friendly competitions among friends</Text>
          <Text style={styles.paragraph}>
            Remember: Bets must comply with all local, state, and federal laws.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Respectful Conduct</Text>
          <Text style={styles.paragraph}>
            We have zero tolerance for:
          </Text>
          <Text style={styles.bulletPoint}>• Harassment, bullying, or threatening behavior</Text>
          <Text style={styles.bulletPoint}>• Hate speech or discriminatory language</Text>
          <Text style={styles.bulletPoint}>• Sexually explicit or inappropriate content</Text>
          <Text style={styles.bulletPoint}>• Impersonation of others</Text>
          <Text style={styles.bulletPoint}>• Spam or unsolicited commercial messages</Text>
          <Text style={styles.bulletPoint}>• Sharing private information without consent</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Fraud and Cheating</Text>
          <Text style={styles.paragraph}>
            The following behaviors will result in immediate account termination:
          </Text>
          <Text style={styles.bulletPoint}>• Creating fake accounts or profiles</Text>
          <Text style={styles.bulletPoint}>• Using multiple accounts to circumvent restrictions</Text>
          <Text style={styles.bulletPoint}>• Providing fraudulent payment information</Text>
          <Text style={styles.bulletPoint}>• Manipulating bet outcomes through collusion</Text>
          <Text style={styles.bulletPoint}>• Exploiting bugs or system vulnerabilities</Text>
          <Text style={styles.bulletPoint}>• Money laundering or using SideBet for illegal financial activity</Text>
          <Text style={styles.bulletPoint}>• Attempting to defraud other users or SideBet</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Payment and Financial Conduct</Text>
          <Text style={styles.paragraph}>
            All users must:
          </Text>
          <Text style={styles.bulletPoint}>• Provide accurate payment information</Text>
          <Text style={styles.bulletPoint}>• Only deposit funds you own and have authorization to use</Text>
          <Text style={styles.bulletPoint}>• Not attempt to reverse or dispute legitimate transactions</Text>
          <Text style={styles.bulletPoint}>• Maintain sufficient balance for active bets</Text>
          <Text style={styles.bulletPoint}>• Comply with all tax reporting obligations in your jurisdiction</Text>
          <Text style={styles.bulletPoint}>• Not use SideBet for commercial betting or professional gambling</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. Dispute Resolution</Text>
          <Text style={styles.paragraph}>
            If a dispute arises:
          </Text>
          <Text style={styles.bulletPoint}>• Communicate respectfully with other participants</Text>
          <Text style={styles.bulletPoint}>• Provide evidence to support your position</Text>
          <Text style={styles.bulletPoint}>• Be willing to compromise when appropriate</Text>
          <Text style={styles.bulletPoint}>• Accept that bet creators have final resolution authority</Text>
          <Text style={styles.bulletPoint}>• Contact support if you believe a user violated guidelines</Text>
          <Text style={styles.paragraph}>
            Remember: SideBet is for friendly betting. Choose your betting partners wisely and bet responsibly.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>9. Responsible Betting</Text>
          <Text style={styles.paragraph}>
            We encourage all users to bet responsibly:
          </Text>
          <Text style={styles.bulletPoint}>• Only bet amounts you can afford to lose</Text>
          <Text style={styles.bulletPoint}>• Set personal limits on betting activity</Text>
          <Text style={styles.bulletPoint}>• Do not chase losses with larger bets</Text>
          <Text style={styles.bulletPoint}>• Take breaks if betting becomes stressful</Text>
          <Text style={styles.bulletPoint}>• Seek help if you develop problematic betting behaviors</Text>
          <Text style={styles.paragraph}>
            If you're concerned about your betting habits, please reach out to support or visit the National Council on Problem Gambling at ncpgambling.org.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>10. Privacy and Data Protection</Text>
          <Text style={styles.paragraph}>
            Respect the privacy of other users:
          </Text>
          <Text style={styles.bulletPoint}>• Do not share screenshots of private conversations</Text>
          <Text style={styles.bulletPoint}>• Do not collect or store other users' personal information</Text>
          <Text style={styles.bulletPoint}>• Do not use SideBet data for commercial purposes</Text>
          <Text style={styles.bulletPoint}>• Report suspected privacy violations to support</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>11. Reporting Violations</Text>
          <Text style={styles.paragraph}>
            If you encounter behavior that violates these guidelines:
          </Text>
          <Text style={styles.bulletPoint}>• Contact us through the Support section in the app</Text>
          <Text style={styles.bulletPoint}>• Provide specific details and evidence when possible</Text>
          <Text style={styles.bulletPoint}>• Do not engage with or retaliate against violators</Text>
          <Text style={styles.bulletPoint}>• Allow our team time to investigate and respond</Text>
          <Text style={styles.paragraph}>
            We take all reports seriously and will investigate violations promptly.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>12. Consequences for Violations</Text>
          <Text style={styles.paragraph}>
            Violations of these Community Guidelines may result in:
          </Text>
          <Text style={styles.bulletPoint}>• Warning and educational guidance</Text>
          <Text style={styles.bulletPoint}>• Temporary suspension of account privileges</Text>
          <Text style={styles.bulletPoint}>• Permanent account termination</Text>
          <Text style={styles.bulletPoint}>• Forfeiture of account balance for serious violations</Text>
          <Text style={styles.bulletPoint}>• Legal action for fraudulent or illegal activity</Text>
          <Text style={styles.paragraph}>
            The severity of consequences depends on the nature and frequency of violations. We reserve the right to take action at our discretion to protect our community.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>13. Updates to Guidelines</Text>
          <Text style={styles.paragraph}>
            We may update these Community Guidelines from time to time to address new issues or improve clarity. Continued use of SideBet after updates constitutes acceptance of the revised guidelines.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>14. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions about these Community Guidelines or need to report a violation, please contact us through the Support section in the app.
          </Text>
          <Text style={styles.paragraph}>
            SideBet LLC{'\n'}
            Community Guidelines Inquiries
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for being a responsible member of the SideBet community!
          </Text>
          <Text style={[styles.footerText, { marginTop: spacing.sm }]}>
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
