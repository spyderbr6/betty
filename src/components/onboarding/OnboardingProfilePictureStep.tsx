/**
 * OnboardingProfilePictureStep
 * Step 1 of onboarding - Add profile picture
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfilePicture } from '../../services/imageUploadService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>();

interface OnboardingProfilePictureStepProps {
  profilePictureUrl: string | null;
  onProfilePictureChange: (url: string | null) => void;
  onNext: () => void;
  onSkip: () => void;
}

export const OnboardingProfilePictureStep: React.FC<OnboardingProfilePictureStepProps> = ({
  profilePictureUrl,
  onProfilePictureChange,
  onNext,
  onSkip,
}) => {
  const { user, refreshAuth } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const handleSelectImage = async () => {
    if (!user) return;

    setIsUploading(true);
    setImageError(false);
    try {
      const result = await updateProfilePicture(
        user.userId,
        profilePictureUrl || undefined
      );

      if (result.success && result.url) {
        // Update user profile in database
        await client.models.User.update({
          id: user.userId,
          profilePictureUrl: result.url,
        });

        // Refresh auth context to update profile picture
        await refreshAuth({ silent: true });

        // Update parent state (no blocking alert - visual feedback is sufficient)
        onProfilePictureChange(result.url);
      } else {
        setImageError(true);
        Alert.alert('Error', result.error || 'Failed to upload profile picture.');
      }
    } catch (error) {
      console.error('[Onboarding] Failed to upload profile picture:', error);
      setImageError(true);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon/Illustration */}
        <View style={styles.iconContainer}>
          {profilePictureUrl ? (
            <>
              <Image
                source={{ uri: profilePictureUrl }}
                style={styles.profileImage}
                onLoadStart={() => setImageLoading(true)}
                onLoadEnd={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
                accessibilityLabel="Profile picture"
              />
              {imageLoading && (
                <View style={styles.imageLoadingOverlay}>
                  <ActivityIndicator color={colors.primary} size="large" />
                </View>
              )}
              {imageError && (
                <View style={styles.imageErrorOverlay}>
                  <Text style={styles.imageErrorText}>Failed to load</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>📷</Text>
            </View>
          )}
        </View>

        {/* Title and Description */}
        <Text style={styles.title}>Add a profile picture</Text>
        <Text style={styles.description}>
          Help your friends recognize you by adding a profile picture. You can always change
          it later in settings.
        </Text>

        {/* Select Image Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSelectImage}
          disabled={isUploading}
          accessibilityLabel={profilePictureUrl ? 'Change profile picture' : 'Choose profile picture'}
          accessibilityRole="button"
        >
          {isUploading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {profilePictureUrl ? 'Change Picture' : 'Choose Photo'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onSkip}
          accessibilityLabel="Skip adding profile picture"
          accessibilityRole="button"
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>

        {profilePictureUrl && (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={onNext}
            accessibilityLabel="Continue to next step"
            accessibilityRole="button"
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.container.padding,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    marginBottom: spacing.xl,
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.error,
  },
  imageErrorText: {
    ...textStyles.caption,
    color: colors.error,
    textAlign: 'center',
    fontWeight: typography.fontWeight.bold,
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 48,
  },
  title: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  description: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    lineHeight: typography.fontSize.base * 1.5,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
  bottomActions: {
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  skipButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
  },
  nextButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
});
