/**
 * OnboardingAddFundsStep
 * Step 2 of onboarding - Add funds to start betting
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../../styles';
import { AddFundsModal } from '../ui/AddFundsModal';
import { AddPaymentMethodModal } from '../ui/AddPaymentMethodModal';

interface OnboardingAddFundsStepProps {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export const OnboardingAddFundsStep: React.FC<OnboardingAddFundsStepProps> = ({
  onNext,
  onSkip,
  onBack,
}) => {
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [showAddPaymentMethodModal, setShowAddPaymentMethodModal] = useState(false);

  const handleAddFunds = () => {
    setShowAddFundsModal(true);
  };

  const handleAddPaymentMethod = () => {
    setShowAddFundsModal(false);
    setTimeout(() => {
      setShowAddPaymentMethodModal(true);
    }, 300);
  };

  const handleFundsAdded = () => {
    // Funds were successfully added, close modal and continue
    setShowAddFundsModal(false);
    setTimeout(() => {
      onNext();
    }, 300);
  };

  const handlePaymentMethodAdded = () => {
    // Payment method added, reopen add funds modal
    setShowAddPaymentMethodModal(false);
    setTimeout(() => {
      setShowAddFundsModal(true);
    }, 300);
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Icon/Illustration */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="wallet" size={64} color={colors.primary} />
            </View>
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>Add funds to start betting</Text>
          <Text style={styles.description}>
            Add funds to your account to place bets with friends. You can deposit via Venmo
            and our team will verify your payment within 1-2 hours.
          </Text>

          {/* Features List */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={24} color={colors.success} />
              <Text style={styles.featureText}>Secure Venmo payments</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="flash" size={24} color={colors.warning} />
              <Text style={styles.featureText}>Quick 1-2 hour verification</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="cash" size={24} color={colors.primary} />
              <Text style={styles.featureText}>Easy withdrawals anytime</Text>
            </View>
          </View>

          {/* Add Funds Button */}
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddFunds}>
            <Ionicons name="add-circle" size={20} color={colors.textInverse} />
            <Text style={styles.primaryButtonText}>Add Funds Now</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add Funds Modal */}
      <AddFundsModal
        visible={showAddFundsModal}
        onClose={() => setShowAddFundsModal(false)}
        onSuccess={handleFundsAdded}
        onAddPaymentMethod={handleAddPaymentMethod}
      />

      {/* Add Payment Method Modal */}
      <AddPaymentMethodModal
        visible={showAddPaymentMethodModal}
        onClose={() => setShowAddPaymentMethodModal(false)}
        onSuccess={handlePaymentMethodAdded}
      />
    </>
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
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingBottom: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  skipButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
});
