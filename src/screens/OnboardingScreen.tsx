/**
 * OnboardingScreen
 * Multi-step onboarding flow for new users
 * - Step 1: Add profile picture
 * - Step 2: Add funds
 * - Step 3: Add friends
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, textStyles, commonStyles } from '../styles';
import { useAuth } from '../contexts/AuthContext';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

// Import step components
import { OnboardingProfilePictureStep } from '../components/onboarding/OnboardingProfilePictureStep';
import { OnboardingAddFundsStep } from '../components/onboarding/OnboardingAddFundsStep';
import { OnboardingAddFriendsStep } from '../components/onboarding/OnboardingAddFriendsStep';

const client = generateClient<Schema>();

interface OnboardingScreenProps {
  visible: boolean;
  onComplete: () => void;
}

const TOTAL_STEPS = 3;

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  visible,
  onComplete,
}) => {
  const { user, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const progressAnim = useState(new Animated.Value(1 / TOTAL_STEPS))[0];

  useEffect(() => {
    // Animate progress bar when step changes
    Animated.timing(progressAnim, {
      toValue: currentStep / TOTAL_STEPS,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  const handleNextStep = async () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
      // Save progress to database
      await saveOnboardingProgress(currentStep + 1);
    } else {
      // Complete onboarding
      await completeOnboarding();
    }
  };

  const handleSkipStep = () => {
    Alert.alert(
      'Skip this step?',
      'You can always complete this later in your account settings.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: handleNextStep,
        },
      ]
    );
  };

  const handlePreviousStep = async () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      await saveOnboardingProgress(currentStep - 1);
    }
  };

  const saveOnboardingProgress = async (step: number) => {
    if (!user) return;

    try {
      await client.models.User.update({
        id: user.userId,
        onboardingStep: step,
      });
    } catch (error) {
      console.error('[Onboarding] Failed to save progress:', error);
    }
  };

  const completeOnboarding = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      await client.models.User.update({
        id: user.userId,
        onboardingCompleted: true,
        onboardingStep: TOTAL_STEPS,
      });

      // Refresh auth context to update user state
      await refreshAuth({ silent: true });

      // Show success and close
      Alert.alert(
        'Welcome to SideBet!',
        "You're all set to start betting with friends.",
        [
          {
            text: 'Get Started',
            onPress: onComplete,
          },
        ]
      );
    } catch (error) {
      console.error('[Onboarding] Failed to complete:', error);
      Alert.alert('Error', 'Failed to complete onboarding. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <OnboardingProfilePictureStep
            onNext={handleNextStep}
            onSkip={handleSkipStep}
          />
        );
      case 2:
        return (
          <OnboardingAddFundsStep
            onNext={handleNextStep}
            onSkip={handleSkipStep}
            onBack={handlePreviousStep}
          />
        );
      case 3:
        return (
          <OnboardingAddFriendsStep
            onComplete={completeOnboarding}
            onSkip={completeOnboarding}
            onBack={handlePreviousStep}
            isLoading={isLoading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        // Prevent dismissing during onboarding
        Alert.alert(
          'Complete Setup',
          'Please complete the onboarding process or skip the remaining steps.',
          [{ text: 'OK' }]
        );
      }}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header with Progress */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Welcome to SideBet</Text>
          <Text style={styles.headerSubtitle}>
            Step {currentStep} of {TOTAL_STEPS}
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        {/* Step Content */}
        <View style={styles.content}>{renderStep()}</View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.padding.screen,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  headerSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: spacing.radius.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
  },
  content: {
    flex: 1,
  },
});
