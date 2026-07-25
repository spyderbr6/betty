/**
 * Subscription Screen
 * Upgrade to Pro or manage an existing subscription.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { showAlert } from '../components/ui/CustomAlert';
import { useAuth } from '../contexts/AuthContext';
import { createSubscription, openCustomerPortal } from '../services/stripeService';
import { PRO_MONTHLY_DISPLAY, WITHDRAWAL_FEE_RATE, WINNINGS_FEE_RATE, DEPOSIT_PROCESSING_FEE_RATE } from '../config/subscriptionConfig';

// @ts-ignore — installed via: npx expo install @stripe/stripe-react-native
import { useStripe } from '@stripe/stripe-react-native';

interface SubscriptionScreenProps {
  onClose: () => void;
}

const PRO_FEATURES = [
  { icon: 'trophy-outline', text: '0% fee on all bet winnings' },
  { icon: 'cash-outline', text: '0% withdrawal fee' },
  { icon: 'card-outline', text: '0% deposit processing fee' },
  { icon: 'flash-outline', text: 'Priority support' },
];

export const SubscriptionScreen: React.FC<SubscriptionScreenProps> = ({ onClose }) => {
  const { user, refreshAuth } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [isLoading, setIsLoading] = useState(false);

  const isPro = user?.subscriptionTier === 'PRO' && user?.subscriptionStatus === 'ACTIVE';

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const result = await createSubscription();
      if (!result.success || !result.clientSecret) {
        showAlert('Error', result.error ?? 'Could not start subscription. Please try again.');
        setIsLoading(false);
        return;
      }

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: result.clientSecret,
        merchantDisplayName: 'SideBet',
        returnURL: 'sidebet://subscription-complete',
      });

      if (initError) {
        showAlert('Error', initError.message ?? 'Could not load payment sheet.');
        setIsLoading(false);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          showAlert('Payment Failed', presentError.message ?? 'Subscription payment was not completed.');
        }
        setIsLoading(false);
        return;
      }

      // Subscription created — webhook will update User.subscriptionTier async
      // Refresh auth context to pick up the change if webhook already fired
      await refreshAuth({ silent: true });

      showAlert(
        'Welcome to Pro!',
        'Your Pro membership is now active. All platform fees have been removed.',
        [{ text: 'Awesome!', onPress: onClose }]
      );
    } catch (err) {
      console.error('[SubscriptionScreen] Upgrade error:', err);
      showAlert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManage = async () => {
    setIsLoading(true);
    try {
      await openCustomerPortal();
    } catch (err) {
      showAlert('Error', 'Could not open subscription portal. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const freeWithdrawalFee = `${(WITHDRAWAL_FEE_RATE * 100).toFixed(0)}%`;
  const freeWinningsFee = `${(WINNINGS_FEE_RATE * 100).toFixed(0)}%`;
  const freeDepositFee = `${(DEPOSIT_PROCESSING_FEE_RATE * 100 * 10).toFixed(0) === '5' ? '0.5' : (DEPOSIT_PROCESSING_FEE_RATE * 100).toFixed(1)}%`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title={isPro ? 'Pro Membership' : 'Upgrade to Pro'} onClose={onClose} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isPro ? (
          // Current Pro member view
          <>
            <View style={styles.proActiveBadge}>
              <Ionicons name="star" size={32} color={colors.warning} />
              <Text style={styles.proActiveTitle}>You're a Pro member</Text>
              <Text style={styles.proActiveSubtitle}>All fees are waived on your account</Text>
            </View>

            <View style={styles.featuresCard}>
              {PRO_FEATURES.map((f) => (
                <View key={f.text} style={styles.featureRow}>
                  <View style={styles.featureCheck}>
                    <Ionicons name="checkmark" size={16} color={colors.success} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleManage}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>Manage Subscription</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.manageHint}>
              Cancel or update your plan in the Stripe billing portal.
            </Text>
          </>
        ) : (
          // Free user — upgrade view
          <>
            <View style={styles.heroSection}>
              <Ionicons name="star" size={48} color={colors.warning} />
              <Text style={styles.heroTitle}>SideBet Pro</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceAmount}>{PRO_MONTHLY_DISPLAY}</Text>
                <Text style={styles.priceUnit}>/month</Text>
              </View>
              <Text style={styles.heroSubtitle}>Keep more of your winnings. Pay zero fees.</Text>
            </View>

            {/* Feature comparison */}
            <View style={styles.comparisonCard}>
              <View style={styles.comparisonHeader}>
                <Text style={styles.comparisonCol} />
                <Text style={[styles.comparisonCol, styles.comparisonColHeader]}>Free</Text>
                <Text style={[styles.comparisonCol, styles.comparisonColHeaderPro]}>Pro</Text>
              </View>
              <ComparisonRow label="Deposit fee" free={freeDepositFee} pro="0%" />
              <ComparisonRow label="Withdrawal fee" free={freeWithdrawalFee} pro="0%" />
              <ComparisonRow label="Winnings fee" free={freeWinningsFee} pro="0%" />
            </View>

            <View style={styles.featuresCard}>
              {PRO_FEATURES.map((f) => (
                <View key={f.text} style={styles.featureRow}>
                  <Ionicons name={f.icon as any} size={18} color={colors.primary} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleUpgrade}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="star" size={18} color={colors.background} />
                  <Text style={styles.primaryButtonText}>
                    Upgrade for {PRO_MONTHLY_DISPLAY}/mo
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.cancelNote}>
              Cancel anytime from the billing portal. No contracts.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

function ComparisonRow({ label, free, pro }: { label: string; free: string; pro: string }) {
  return (
    <View style={styles.comparisonRow}>
      <Text style={[styles.comparisonCol, styles.comparisonLabel]}>{label}</Text>
      <Text style={[styles.comparisonCol, styles.comparisonFreeVal]}>{free}</Text>
      <Text style={[styles.comparisonCol, styles.comparisonProVal]}>{pro}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },

  // Pro active
  proActiveBadge: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  proActiveTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  proActiveSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  heroTitle: {
    ...textStyles.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  priceAmount: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.black,
    color: colors.primary,
    fontFamily: typography.fontFamily.bold,
  },
  priceUnit: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  heroSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Comparison table
  comparisonCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  comparisonHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  comparisonCol: {
    flex: 1,
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  comparisonColHeader: {
    ...textStyles.label,
    color: colors.textMuted,
  },
  comparisonColHeaderPro: {
    ...textStyles.label,
    color: colors.warning,
  },
  comparisonLabel: {
    textAlign: 'left',
    color: colors.textPrimary,
    flex: 2,
  },
  comparisonFreeVal: {
    color: colors.error,
    fontWeight: typography.fontWeight.semibold,
  },
  comparisonProVal: {
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },

  // Features list
  featuresCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.success + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  featureText: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    marginBottom: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: colors.border,
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.xs,
  },
  cancelNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  manageHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
