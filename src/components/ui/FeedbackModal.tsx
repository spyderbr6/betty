/**
 * FeedbackModal Component
 * Modal for capturing user feedback to submit as GitHub issues
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, textStyles } from '../../styles';
import { ModalHeader } from './ModalHeader';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (feedback: FeedbackData) => Promise<void>;
}

export interface FeedbackData {
  title: string;
  description: string;
  type: 'bug' | 'feature' | 'improvement' | 'question';
}

const FEEDBACK_TYPES = [
  { id: 'bug', label: 'Bug Report', icon: 'bug-outline', color: colors.error },
  { id: 'feature', label: 'Feature Request', icon: 'bulb-outline', color: colors.warning },
  { id: 'improvement', label: 'Improvement', icon: 'arrow-up-outline', color: colors.primary },
  { id: 'question', label: 'Question', icon: 'help-circle-outline', color: colors.textSecondary },
] as const;

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackData['type']>('improvement');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing Information', 'Please provide both a title and description for your feedback.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        type,
      });

      // Reset form
      setTitle('');
      setDescription('');
      setType('improvement');
      onClose();

      Alert.alert(
        'Feedback Submitted!',
        'Thank you for your feedback. We\'ll review it and get back to you.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error submitting feedback:', error);
      Alert.alert(
        'Submission Failed',
        'Failed to submit your feedback. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (title.trim() || description.trim()) {
      Alert.alert(
        'Discard Feedback?',
        'You have unsaved changes. Are you sure you want to close?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setTitle('');
              setDescription('');
              setType('improvement');
              onClose();
            }
          },
        ]
      );
    } else {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Standardized Modal Header with Send Button */}
          <ModalHeader
            title="Send Feedback"
            onClose={handleClose}
            rightComponent={
              <TouchableOpacity
                style={[styles.submitButton, (!title.trim() || !description.trim() || isSubmitting) && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={!title.trim() || !description.trim() || isSubmitting}
                activeOpacity={0.7}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.submitButtonText}>Send</Text>
                )}
              </TouchableOpacity>
            }
          />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Feedback Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Feedback Type</Text>
            <View style={styles.typeGrid}>
              {FEEDBACK_TYPES.map((feedbackType) => (
                <TouchableOpacity
                  key={feedbackType.id}
                  style={[
                    styles.typeButton,
                    type === feedbackType.id && styles.typeButtonSelected,
                    { borderColor: feedbackType.color }
                  ]}
                  onPress={() => setType(feedbackType.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={feedbackType.icon as any}
                    size={20}
                    color={type === feedbackType.id ? feedbackType.color : colors.textMuted}
                  />
                  <Text style={[
                    styles.typeButtonText,
                    type === feedbackType.id && { color: feedbackType.color }
                  ]}>
                    {feedbackType.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Title Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Title *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Brief summary of your feedback"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
            <Text style={styles.characterCount}>{title.length}/100</Text>
          </View>

          {/* Description Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description *</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              placeholder="Provide detailed information about your feedback. For bugs, include steps to reproduce. For features, describe what you'd like to see."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={styles.characterCount}>{description.length}/1000</Text>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.infoText}>
              Your feedback will be submitted as a GitHub issue. No personal information is shared.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },

  // Submit Button (used in ModalHeader rightComponent)
  submitButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  submitButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.medium,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  section: {
    marginVertical: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },

  // Type Selection
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  typeButton: {
    flex: 1,
    minWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeButtonSelected: {
    backgroundColor: colors.surface,
    borderWidth: 2,
  },
  typeButtonText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    fontSize: 12,
  },

  // Input Fields
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
  },
  textAreaInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  characterCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
    fontSize: 11,
  },

  // Info Section
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    padding: spacing.md,
    borderRadius: spacing.radius.sm,
    marginVertical: spacing.lg,
  },
  infoText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    flex: 1,
    lineHeight: 18,
  },
});