/**
 * Help & About Screen
 * Feedback, FAQ and safety tips, then the legal pages and app version. Merges the old
 * Support and About screens, plus the safety tips from the old Trust & Safety screen.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader, type ModalHeaderVariant } from '../components/ui/ModalHeader';
import { FeedbackModal, FeedbackData } from '../components/ui/FeedbackModal';
import { submitFeedbackToGitHub } from '../utils/github';
import { PrivacyPolicyScreen } from './PrivacyPolicyScreen';
import { TermsOfServiceScreen } from './TermsOfServiceScreen';
import { CommunityGuidelinesScreen } from './CommunityGuidelinesScreen';
import { OpenSourceLicensesScreen } from './OpenSourceLicensesScreen';

interface HelpScreenProps {
  onClose: () => void;
  /** 'back' when shown as a page in the Account stack rather than as a modal. */
  headerVariant?: ModalHeaderVariant;
}

type LegalPage = 'terms' | 'privacy' | 'guidelines' | 'licenses';

export const HelpScreen: React.FC<HelpScreenProps> = ({ onClose, headerVariant }) => {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null);

  const handleSubmitFeedback = async (feedback: FeedbackData) => {
    await submitFeedbackToGitHub(feedback);
  };

  const closeLegalPage = () => setLegalPage(null);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-help">
      <ModalHeader title="Help & About" onClose={onClose} variant={headerVariant} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTACT US</Text>

          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => setShowFeedbackModal(true)}
            activeOpacity={0.7}
            testID="help-feedback"
          >
            <View style={[styles.contactIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={28} color={colors.primary} />
            </View>
            <View style={styles.contactContent}>
              <Text style={styles.contactTitle}>Send Feedback</Text>
              <Text style={styles.contactSubtitle}>Report bugs, request features, or ask questions</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FAQ</Text>

          <FAQItem
            question="How do I create a bet?"
            answer="Open the Create tab, fill in the bet details, and invite friends to join."
          />

          <FAQItem
            question="How does bet resolution work?"
            answer="The bet creator determines the outcome and selects the winning side. Payouts are automatically distributed."
          />

          <FAQItem
            question="What is Trust Score?"
            answer="Trust Score reflects your betting history and reliability. It's calculated based on your bet completion rate and friend interactions."
          />

          <FAQItem
            question="How do I add friends?"
            answer="Open Account, then Friends, and search by username, email, or display name to send friend requests."
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SAFETY TIPS</Text>
          <TipItem icon="warning-outline" text="Never share your account password with anyone" />
          <TipItem icon="shield-outline" text="Turn on two-factor authentication in Settings" />
          <TipItem icon="people-outline" text="Only accept bets from people you trust" />
        </View>

        {/* Legal */}
        <View style={styles.linksSection}>
          <LinkItem
            icon="document-text-outline"
            text="Terms of Service"
            onPress={() => setLegalPage('terms')}
            testID="help-terms"
          />
          <LinkItem
            icon="shield-checkmark-outline"
            text="Privacy Policy"
            onPress={() => setLegalPage('privacy')}
            testID="help-privacy"
          />
          <LinkItem
            icon="people-outline"
            text="Community Guidelines"
            onPress={() => setLegalPage('guidelines')}
            testID="help-guidelines"
          />
          <LinkItem
            icon="code-slash-outline"
            text="Open Source Licenses"
            onPress={() => setLegalPage('licenses')}
            testID="help-licenses"
          />
        </View>

        {/* App info */}
        <View style={styles.footer}>
          <Text style={styles.appName}>SideBet</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.copyright}>© 2025 SideBet LLC. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* Feedback Modal */}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmit={handleSubmitFeedback}
      />

      {/* Legal pages */}
      <Modal
        visible={legalPage !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeLegalPage}
      >
        {legalPage === 'terms' && <TermsOfServiceScreen onClose={closeLegalPage} />}
        {legalPage === 'privacy' && <PrivacyPolicyScreen onClose={closeLegalPage} />}
        {legalPage === 'guidelines' && <CommunityGuidelinesScreen onClose={closeLegalPage} />}
        {legalPage === 'licenses' && <OpenSourceLicensesScreen onClose={closeLegalPage} />}
      </Modal>
    </SafeAreaView>
  );
};

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textMuted}
        />
      </View>
      {expanded && (
        <Text style={styles.faqAnswer}>{answer}</Text>
      )}
    </TouchableOpacity>
  );
};

interface TipItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}

const TipItem: React.FC<TipItemProps> = ({ icon, text }) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={20} color={colors.warning} />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

interface LinkItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress: () => void;
  testID?: string;
}

const LinkItem: React.FC<LinkItemProps> = ({ icon, text, onPress, testID }) => (
  <TouchableOpacity style={styles.linkItem} onPress={onPress} activeOpacity={0.7} testID={testID}>
    <View style={styles.linkItemLeft}>
      <Ionicons name={icon} size={22} color={colors.textSecondary} />
      <Text style={styles.linkItemText}>{text}</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
  },
  contactIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  contactContent: {
    flex: 1,
  },
  contactTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  contactSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  faqItem: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    ...textStyles.button,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: typography.fontWeight.semibold,
  },
  faqAnswer: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  tipText: {
    ...textStyles.body,
    color: colors.textSecondary,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
  linksSection: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkItemText: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  appName: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  appVersion: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  copyright: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
