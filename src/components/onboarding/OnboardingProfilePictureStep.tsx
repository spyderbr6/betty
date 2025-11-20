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
  ScrollView,
} from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { updateProfilePicture } from '../../services/imageUploadService';
import { generateClient } from 'aws-amplify/data';
import type { Schema} from '../../../amplify/data/resource';

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
  const loadedUrlRef = React.useRef<string | null>(null);

  // Reset error state and loading state when profilePictureUrl changes
  React.useEffect(() => {
    console.log('[OnboardingProfilePicture] profilePictureUrl prop changed:', {
      hasUrl: !!profilePictureUrl,
      urlPreview: profilePictureUrl?.substring(0, 100),
      isDifferentFromLoaded: loadedUrlRef.current !== profilePictureUrl,
    });

    // Only reset if URL actually changed
    if (loadedUrlRef.current !== profilePictureUrl) {
      setImageError(false);
      setImageLoading(!!profilePictureUrl); // Set loading if we have a URL
      loadedUrlRef.current = null; // Clear loaded URL
    }
  }, [profilePictureUrl]);

  const handleSelectImage = async () => {
    if (!user) return;

    setIsUploading(true);
    setImageError(false);
    try {
      const result = await updateProfilePicture(
        user.userId,
        profilePictureUrl || undefined
      );

      console.log('[OnboardingProfilePicture] Upload result:', {
        success: result.success,
        hasUrl: !!result.url,
        s3Key: result.url,
        error: result.error,
      });

      if (result.success && result.url) {
        // result.url is the S3 KEY, not a signed URL
        const s3Key = result.url;

        console.log('[OnboardingProfilePicture] Upload successful, S3 key:', s3Key);

        // Update user profile in database with S3 key
        await client.models.User.update({
          id: user.userId,
          profilePictureUrl: s3Key,
        });

        // Refresh auth context to update profile picture
        await refreshAuth({ silent: true });

        // Update parent state with S3 KEY (not signed URL!)
        // The useEffect will convert it to signed URL for display
        onProfilePictureChange(s3Key);
      } else {
        console.error('[OnboardingProfilePicture] Upload failed:', result.error);
        setImageError(true);
        showAlert('Error', result.error || 'Failed to upload profile picture.');
      }
    } catch (error) {
      console.error('[Onboarding] Failed to upload profile picture:', error);
      setImageError(true);
      showAlert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon/Illustration */}
        <View style={styles.iconContainer}>
          {profilePictureUrl && !imageError ? (
            <>
              <Image
                key={profilePictureUrl}
                source={{ uri: profilePictureUrl }}
                style={styles.profileImage}
                resizeMode="cover"
                onLoadStart={() => {
                  // Only set loading if this is actually a new URL
                  if (loadedUrlRef.current !== profilePictureUrl) {
                    console.log('[OnboardingProfilePicture] Image load started for new URL');
                    setImageLoading(true);
                  }
                }}
                onLoadEnd={() => {
                  console.log('[OnboardingProfilePicture] Image load ended successfully');
                  setImageLoading(false);
                  loadedUrlRef.current = profilePictureUrl; // Mark as loaded
                }}
                onError={(error) => {
                  console.error('[OnboardingProfilePicture] Image load error:', error.nativeEvent);
                  setImageError(true);
                  setImageLoading(false);
                  loadedUrlRef.current = profilePictureUrl; // Mark as attempted
                }}
                accessibilityLabel="Profile picture"
              />
              {imageLoading && (
                <View style={styles.imageLoadingOverlay}>
                  <ActivityIndicator color={colors.primary} size="large" />
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>📷</Text>
              {imageError && (
                <Text style={styles.errorHintText}>Image failed to load</Text>
              )}
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
      </ScrollView>

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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.container.padding,
    paddingVertical: spacing.xl,
    paddingBottom: spacing.xl * 2,
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
  errorHintText: {
    ...textStyles.caption,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
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
    paddingHorizontal: spacing.container.padding,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  skipButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
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
