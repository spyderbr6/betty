/**
 * Profile Editor Component
 * Allows users to edit their display name and profile picture
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, textStyles } from '../../styles';
import { ProfileEditForm, User } from '../../types/betting';
import { updateProfilePicture } from '../../services/imageUploadService';
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
  const [profilePicture, setProfilePicture] = useState(user.profilePictureUrl || '');
  const [isValid, setIsValid] = useState(true);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
        profilePicture: profilePicture || undefined,
      };
      await onSave(profileData);
    } catch (error) {
      console.error('Error saving profile:', error);
      showAlert('Error', 'Failed to save profile. Please try again.');
    }
  };

  const handleProfilePicturePress = async () => {
    if (isUploadingImage) return;

    try {
      setIsUploadingImage(true);

      const result = await updateProfilePicture(user.id, profilePicture);

      if (result.success && result.url) {
        setProfilePicture(result.url);

        // Automatically save the profile picture to the database
        try {
          const profileData: ProfileEditForm = {
            displayName: displayName.trim() || user.displayName || '',
            profilePicture: result.url,
          };
          await onSave(profileData);
          // Success alert is shown by the parent component
        } catch (saveError) {
          console.error('Error saving profile picture:', saveError);
          showAlert('Error', 'Profile picture uploaded but failed to save. Please try clicking Save Changes.');
        }
      } else {
        showAlert('Error', result.error || 'Failed to update profile picture');
      }
    } catch (error) {
      console.error('Error updating profile picture:', error);
      showAlert('Error', 'Failed to update profile picture. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const hasChanges =
    displayName.trim() !== (user.displayName || '') ||
    profilePicture !== (user.profilePictureUrl || '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Edit Profile</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Profile Picture Section */}
        <View style={styles.pictureSection}>
          <TouchableOpacity
            style={styles.pictureContainer}
            onPress={handleProfilePicturePress}
            activeOpacity={0.7}
            disabled={isUploadingImage}
          >
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={styles.profileImage} resizeMode="cover" />
            ) : (
              <View style={styles.placeholderImage}>
                <Ionicons name="person" size={40} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.editBadge}>
              {isUploadingImage ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="camera" size={16} color={colors.background} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.pictureLabel}>
            {isUploadingImage ? 'Uploading...' : 'Tap to change profile picture'}
          </Text>
        </View>

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
            (!hasChanges || !isValid || loading || isUploadingImage) && styles.saveButtonDisabled
          ]}
          onPress={handleSave}
          disabled={!hasChanges || !isValid || loading || isUploadingImage}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    padding: spacing.xs,
  },

  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },

  // Profile Picture
  pictureSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  pictureContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  placeholderImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  pictureLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
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