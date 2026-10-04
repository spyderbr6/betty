/**
 * Profile Editor Component
 * Edits the display name. The profile picture is changed by tapping the avatar on the
 * Account screen, which goes straight to the picker.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, textStyles } from '../../styles';
import { ProfileEditForm, User } from '../../types/betting';
import { ModalHeader } from './ModalHeader';
import { showAlert } from './CustomAlert';

interface ProfileEditorProps {
  user: User;
  onSave: (profileData: ProfileEditForm) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  user,
  onSave,
  onCancel,
  loading = false,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [isValid, setIsValid] = useState(true);

  const validateForm = () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      showAlert('Invalid Name', 'Display name must be at least 2 characters long.');
      setIsValid(false);
      return false;
    }
    if (trimmedName.length > 30) {
      showAlert('Invalid Name', 'Display name must be less than 30 characters.');
      setIsValid(false);
      return false;
    }
    setIsValid(true);
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      const profileData: ProfileEditForm = {
        displayName: displayName.trim(),
      };
      await onSave(profileData);
    } catch (error) {
      console.error('Error saving profile:', error);
      showAlert('Error', 'Failed to save profile. Please try again.');
    }
  };

  const hasChanges = displayName.trim() !== (user.displayName || '');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ModalHeader title="Edit Profile" onClose={onCancel} />

      <View style={styles.content}>
        {/* Display Name Section */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Display Name</Text>
          <View style={[
            styles.inputContainer,
            !isValid && styles.inputError
          ]}>
            <TextInput
              style={styles.textInput}
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                setIsValid(true);
              }}
              placeholder="Enter your display name"
              placeholderTextColor={colors.textMuted}
              maxLength={30}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              testID="profile-editor-name"
            />
            <Text style={styles.characterCount}>
              {displayName.length}/30
            </Text>
          </View>
          <Text style={styles.inputHelper}>
            This is how your name will appear to friends
          </Text>
        </View>

        {/* Username Display (Read-only) */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Username</Text>
          <View style={styles.readOnlyContainer}>
            <Text style={styles.readOnlyText}>@{user.username}</Text>
            <Text style={styles.readOnlyHelper}>Username cannot be changed</Text>
          </View>
        </View>

        {/* Email Display (Read-only) */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Email</Text>
          <View style={styles.readOnlyContainer}>
            <Text style={styles.readOnlyText}>{user.email}</Text>
            <Text style={styles.readOnlyHelper}>Email cannot be changed</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!hasChanges || !isValid || loading) && styles.saveButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!hasChanges || !isValid || loading}
          activeOpacity={0.7}
          testID="profile-editor-save"
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },

  // Input Sections
  inputSection: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...textStyles.label,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
  },
  textInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    textAlignVertical: 'center',
  },
  characterCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  inputHelper: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: 12,
  },

  // Read-only username
  readOnlyContainer: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readOnlyText: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
  },
  readOnlyHelper: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs / 2,
    fontSize: 11,
  },

  // Action Buttons
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  saveButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  saveButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  saveButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
});
