/**
 * Support Screen
 * Help center and contact support
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { FeedbackModal, FeedbackData } from '../components/ui/FeedbackModal';
import { submitFeedbackToGitHub } from '../utils/github';

interface SupportScreenProps {
  onClose: () => void;
}

export const SupportScreen: React.FC<SupportScreenProps> = ({ onClose }) => {
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const handleSubmitFeedback = async (feedback: FeedbackData) => {
    await submitFeedbackToGitHub(feedback);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Support" onClose={onClose} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONTACT US</Text>

          <TouchableOpacity style={styles.contactCard} onPress={() => setShowFeedbackModal(true)} activeOpacity={0.7}>
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
            answer="Tap the '+' icon on the home screen, fill in the bet details, and invite friends to join."
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
            answer="Go to the Friends tab and search by username, email, or display name to send friend requests."
          />
        </View>

        <View style={styles.helpBanner}>
          <Ionicons name="help-circle-outline" size={24} color={colors.info} />
          <View style={styles.helpBannerContent}>
            <Text style={styles.helpBannerTitle}>Need More Help?</Text>
            <Text style={styles.helpBannerText}>
              Check our documentation or reach out to the community for assistance.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Feedback Modal */}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmit={handleSubmitFeedback}
      />
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
  helpBanner: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.info + '40',
  },
  helpBannerContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  helpBannerTitle: {
    ...textStyles.button,
    color: colors.info,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  helpBannerText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
