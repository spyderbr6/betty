/**
 * OnboardingAddFriendsStep
 * Step 3 of onboarding - Add friends to bet with
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../../styles';
import { AddFriendModal } from '../ui/AddFriendModal';

interface OnboardingAddFriendsStepProps {
  friendsAdded: number;
  onFriendsAddedChange: (count: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

export const OnboardingAddFriendsStep: React.FC<OnboardingAddFriendsStepProps> = ({
  friendsAdded,
  onFriendsAddedChange,
  onComplete,
  onSkip,
  onBack,
  isLoading = false,
}) => {
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);

  const handleAddFriend = () => {
    setShowAddFriendModal(true);
  };

  const handleFriendRequestSent = () => {
    onFriendsAddedChange(friendsAdded + 1);
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Icon/Illustration */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="people" size={64} color={colors.primary} />
            </View>
            {friendsAdded > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{friendsAdded}</Text>
              </View>
            )}
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>
            {friendsAdded > 0 ? 'Great! Add more friends' : 'Add friends to bet with'}
          </Text>
          <Text style={styles.description}>
            {friendsAdded > 0
              ? `You've sent ${friendsAdded} friend request${friendsAdded !== 1 ? 's' : ''}! Add more friends or finish setup to start betting.`
              : 'Search for friends by email or username and send them a friend request. They\'ll receive a notification and can start betting with you once they accept.'}
          </Text>

          {/* Features List */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="search" size={24} color={colors.primary} />
              <Text style={styles.featureText}>Search by email or username</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="person-add" size={24} color={colors.success} />
              <Text style={styles.featureText}>Send friend requests instantly</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="trophy" size={24} color={colors.warning} />
              <Text style={styles.featureText}>Challenge friends to bets</Text>
            </View>
          </View>

          {/* Add Friend Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleAddFriend}
            accessibilityLabel={friendsAdded > 0 ? 'Add more friends' : 'Find friends to add'}
            accessibilityRole="button"
          >
            <Ionicons name="person-add" size={20} color={colors.textInverse} />
            <Text style={styles.primaryButtonText}>
              {friendsAdded > 0 ? 'Add More Friends' : 'Find Friends'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            accessibilityLabel="Go back to previous step"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.rightActions}>
            {friendsAdded === 0 && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={onSkip}
                accessibilityLabel="Skip adding friends"
                accessibilityRole="button"
              >
                <Text style={styles.skipButtonText}>Skip for now</Text>
              </TouchableOpacity>
            )}

            {friendsAdded > 0 && (
              <TouchableOpacity
                style={styles.finishButton}
                onPress={handleFinish}
                disabled={isLoading}
                accessibilityLabel="Finish onboarding setup"
                accessibilityRole="button"
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <>
                    <Text style={styles.finishButtonText}>Finish Setup</Text>
                    <Ionicons name="checkmark" size={20} color={colors.textInverse} />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Add Friend Modal */}
      <AddFriendModal
        visible={showAddFriendModal}
        onClose={() => setShowAddFriendModal(false)}
        onRequestSent={handleFriendRequestSent}
      />
    </>
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
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: colors.success,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  badgeText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
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
  featuresList: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  featureText: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    minWidth: 200,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    marginLeft: spacing.xs,
  },
  bottomActions: {
    paddingHorizontal: spacing.container.padding,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  backButtonText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  finishButton: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  finishButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    marginRight: spacing.xs,
  },
});
