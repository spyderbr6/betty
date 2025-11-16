/**
 * FileDisputeModal Component
 * Modal for filing disputes against bet resolutions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, textStyles } from '../../styles';
import { ModalHeader } from './ModalHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bet } from '../../types/betting';
import { DisputeService, DisputeReason } from '../../services/disputeService';
import { showAlert } from './CustomAlert';

interface FileDisputeModalProps {
  visible: boolean;
  onClose: () => void;
  bet: Bet | null;
  userId: string;
  onDisputeFiled?: () => void;
}

const DISPUTE_REASONS = [
  {
    id: 'INCORRECT_RESOLUTION' as DisputeReason,
    label: 'Incorrect Winner',
    description: 'The wrong side was chosen as the winner',
    icon: 'close-circle-outline',
    color: colors.error
  },
  {
    id: 'EVIDENCE_IGNORED' as DisputeReason,
    label: 'Evidence Ignored',
    description: 'Valid evidence was not considered',
    icon: 'document-text-outline',
    color: colors.warning
  },
  {
    id: 'NO_RESOLUTION' as DisputeReason,
    label: 'No Resolution',
    description: 'Bet was never properly resolved',
    icon: 'help-circle-outline',
    color: colors.textSecondary
  },
  {
    id: 'OTHER' as DisputeReason,
    label: 'Other Reason',
    description: 'Other dispute reason (explain below)',
    icon: 'alert-circle-outline',
    color: colors.primary
  },
];

export const FileDisputeModal: React.FC<FileDisputeModalProps> = ({
  visible,
  onClose,
  bet,
  userId,
  onDisputeFiled,
}) => {
  const [selectedReason, setSelectedReason] = useState<DisputeReason>('INCORRECT_RESOLUTION');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!bet) return;

    if (!description.trim()) {
      showAlert('Missing Information', 'Please provide a description of your dispute.');
      return;
    }

    if (description.trim().length < 20) {
      showAlert('Description Too Short', 'Please provide a detailed explanation (at least 20 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      // Call DisputeService to file the dispute
      await DisputeService.fileDispute({
        betId: bet.id,
        filedBy: userId,
        againstUserId: bet.creatorId,
        reason: selectedReason,
        description: description.trim(),
        evidenceUrls: [], // Future: add evidence upload
      });

      // Reset form
      setDescription('');
      setSelectedReason('INCORRECT_RESOLUTION');

      // Show success alert FIRST, then close modal when user clicks OK
      showAlert(
        'Dispute Filed',
        'Your dispute has been submitted and will be reviewed by an administrator. The payout is now on hold.',
        [{
          text: 'OK',
          onPress: () => {
            onClose();
            onDisputeFiled?.();
          }
        }]
      );
    } catch (error: any) {
      console.error('Error filing dispute:', error);
      showAlert(
        'Failed to File Dispute',
        error.message || 'Please try again later.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (description.trim()) {
      showAlert(
        'Discard Dispute?',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setDescription('');
              setSelectedReason('INCORRECT_RESOLUTION');
              onClose();
            },
          },
        ]
      );
    } else {
      onClose();
    }
  };

  if (!bet) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="File Dispute" onClose={handleClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Bet Information */}
            <View style={styles.betInfo}>
              <Text style={styles.betInfoTitle}>Disputing:</Text>
              <Text style={styles.betTitle}>{bet.title}</Text>
              {bet.resolutionReason && (
                <>
                  <Text style={styles.betInfoLabel}>Current Resolution:</Text>
                  <Text style={styles.betResolution}>{bet.resolutionReason}</Text>
                </>
              )}
            </View>

            {/* Dispute Reason Selector */}
            <Text style={styles.sectionTitle}>Reason for Dispute</Text>
            <View style={styles.reasonsContainer}>
              {DISPUTE_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason.id}
                  style={[
                    styles.reasonOption,
                    selectedReason === reason.id && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setSelectedReason(reason.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.reasonHeader}>
                    <Ionicons
                      name={reason.icon as any}
                      size={20}
                      color={selectedReason === reason.id ? colors.background : reason.color}
                    />
                    <Text style={[
                      styles.reasonLabel,
                      selectedReason === reason.id && styles.reasonLabelSelected
                    ]}>
                      {reason.label}
                    </Text>
                    {selectedReason === reason.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.background}
                        style={styles.reasonCheckmark}
                      />
                    )}
                  </View>
                  <Text style={[
                    styles.reasonDescription,
                    selectedReason === reason.id && styles.reasonDescriptionSelected
                  ]}>
                    {reason.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description Input */}
            <Text style={styles.sectionTitle}>Detailed Explanation *</Text>
            <Text style={styles.sectionSubtitle}>
              Explain why you believe this resolution is incorrect. Be specific and provide details.
            </Text>
            <TextInput
              style={styles.descriptionInput}
              placeholder="Describe your dispute in detail..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.characterCount}>
              {description.length}/500 characters
            </Text>

            {/* Evidence Upload (Future Feature) */}
            <View style={styles.evidenceSection}>
              <Text style={styles.sectionTitle}>Evidence (Optional)</Text>
              <Text style={styles.sectionSubtitle}>
                Evidence upload coming soon. For now, include details in your description.
              </Text>
            </View>

            {/* Warning Message */}
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text style={styles.warningText}>
                Filing a false dispute may result in penalties to your trust score. Only file disputes if you believe there was a genuine error.
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (isSubmitting || !description.trim()) && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="alert-circle" size={20} color={colors.background} />
                  <Text style={styles.submitButtonText}>Submit Dispute</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },

  // Bet Info Section
  betInfo: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  betInfoTitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs / 2,
  },
  betTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  betInfoLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.xs / 2,
  },
  betResolution: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  // Section Titles
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },

  // Dispute Reasons
  reasonsContainer: {
    marginBottom: spacing.md,
  },
  reasonOption: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  reasonOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs / 2,
  },
  reasonLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
    flex: 1,
  },
  reasonLabelSelected: {
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  reasonCheckmark: {
    marginLeft: spacing.sm,
  },
  reasonDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginLeft: 28, // Align with label (icon width + margin)
  },
  reasonDescriptionSelected: {
    color: colors.background,
    opacity: 0.9,
  },

  // Description Input
  descriptionInput: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  characterCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs / 2,
  },

  // Evidence Section
  evidenceSection: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },

  // Warning Box
  warningBox: {
    flexDirection: 'row',
    backgroundColor: colors.warning + '10',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  warningText: {
    ...textStyles.caption,
    color: colors.warning,
    fontSize: typography.fontSize.xs,
    marginLeft: spacing.sm,
    flex: 1,
    lineHeight: 16,
  },

  // Submit Button
  submitButton: {
    flexDirection: 'row',
    backgroundColor: colors.error,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.base,
    marginLeft: spacing.sm,
    fontWeight: typography.fontWeight.bold,
  },
});
