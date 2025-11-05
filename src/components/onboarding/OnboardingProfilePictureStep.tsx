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
import { ImageUploadService } from '../../services/imageUploadService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';

const client = generateClient<Schema>();

interface OnboardingProfilePictureStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export const OnboardingProfilePictureStep: React.FC<OnboardingProfilePictureStepProps> = ({
  onNext,
  onSkip,
}) => {
  const { user, refreshAuth } = useAuth();
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSelectImage = async () => {
    if (!user) return;

    setIsUploading(true);
    try {
      const newUrl = await ImageUploadService.updateProfilePicture(
        user.userId,
        profilePictureUrl || undefined
      );

      if (newUrl) {
        setProfilePictureUrl(newUrl);

        // Update user profile in database
        await client.models.User.update({
          id: user.userId,
          profilePictureUrl: newUrl,
        });

        // Refresh auth context to update profile picture
        await refreshAuth({ silent: true });

        Alert.alert('Success', 'Profile picture updated!');
      }
    } catch (error) {
      console.error('[Onboarding] Failed to upload profile picture:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleNext = () => {
    if (profilePictureUrl) {
      onNext();
    } else {
      Alert.alert(
        'Add Profile Picture?',
        'Adding a profile picture helps your friends recognize you.',
        [
          {
            text: 'Skip for now',
            style: 'cancel',
            onPress: onSkip,
          },
          {
            text: 'Add Picture',
            onPress: handleSelectImage,
          },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon/Illustration */}
        <View style={styles.iconContainer}>
          {profilePictureUrl ? (
            <Image source={{ uri: profilePictureUrl }} style={styles.profileImage} />
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
        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>

        {profilePictureUrl && (
          <TouchableOpacity style={styles.nextButton} onPress={onNext}>
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
    paddingHorizontal: spacing.padding.screen,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    marginBottom: spacing.xl,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
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
