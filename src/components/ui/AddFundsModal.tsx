/**
 * Add Funds Modal — Stripe card payment flow
 * Replaces the old manual Venmo reconciliation flow.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, textStyles } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { ModalHeader } from './ModalHeader';
import { showAlert } from './CustomAlert';
import { createPaymentIntent, calculateDepositCharge } from '../../services/stripeService';

// @ts-ignore — installed via: npx expo install @stripe/stripe-react-native
import { useStripe } from '@stripe/stripe-react-native';

interface AddFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MIN_DEPOSIT = 5;
const MAX_DEPOSIT = 500;

export const AddFundsModal: React.FC<AddFundsModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [didSucceed, setDidSucceed] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const { processingFee, totalCharge } = calculateDepositCharge(numAmount);
  const isAmountValid = numAmount >= MIN_DEPOSIT && numAmount <= MAX_DEPOSIT;

  const resetState = () => {
    setAmount('');
    setIsProcessing(false);
    setDidSucceed(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handlePay = async () => {
    if (!user?.userId || !isAmountValid) return;
    setIsProcessing(true);

    try {
      // 1. Create PaymentIntent on backend
      const intentData = await createPaymentIntent(numAmount);
      if (!intentData?.clientSecret) {
        showAlert('Error', 'Could not initialize payment. Please try again.');
        setIsProcessing(false);
        return;
      }

      // 2. Initialize Stripe Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: intentData.clientSecret,
        merchantDisplayName: 'SideBet',
        defaultBillingDetails: { name: user.displayName ?? user.username },
        returnURL: 'sidebet://payment-complete',
      });

      if (initError) {
        showAlert('Error', initError.message ?? 'Could not load payment sheet.');
        setIsProcessing(false);
        return;
      }

      // 3. Present Payment Sheet — user enters card / uses Apple/Google Pay
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        // Log every outcome — a silent 'Canceled' return is otherwise
        // indistinguishable from the sheet never opening.
        console.log('[AddFundsModal] Payment sheet returned:', presentError);
        if (presentError.code !== 'Canceled') {
          showAlert('Payment Failed', presentError.message ?? 'Payment was not completed.');
        }
        setIsProcessing(false);
        return;
      }

      console.log('[AddFundsModal] Payment confirmed, awaiting webhook to credit balance');

      // 4. Payment confirmed — balance updates via Stripe webhook within seconds
      setDidSucceed(true);
      onSuccess?.();
    } catch (err) {
      console.error('[AddFundsModal] Payment error:', err);
      showAlert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderAmountEntry = () => (
    <ScrollView
      style={styles.stepContent}
      contentContainerStyle={styles.stepContentContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>DEPOSIT AMOUNT</Text>

      <View style={styles.inputSection}>
        <View style={[styles.amountInputContainer, amountFocused && styles.amountInputContainerFocused]}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            // On web, autoFocus makes the browser scroll the field into view,
            // which shifts the layout horizontally and clips the left edge.
            autoFocus={Platform.OS !== 'web'}
            textAlignVertical="center"
          />
        </View>
        <Text style={styles.inputHint}>Min ${MIN_DEPOSIT} · Max ${MAX_DEPOSIT}</Text>
      </View>

      {/* Fee breakdown — only show when amount is entered */}
      {numAmount > 0 && (
        <View style={styles.feeCard}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Deposit amount</Text>
            <Text style={styles.feeValue}>${numAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Card processing fee</Text>
            <Text style={styles.feeValue}>${processingFee.toFixed(2)}</Text>
          </View>
          <View style={styles.feeDivider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeTotalLabel}>Total charged</Text>
            <Text style={styles.feeTotalValue}>${totalCharge.toFixed(2)}</Text>
          </View>
          <Text style={styles.feeNote}>
            ${numAmount.toFixed(2)} will be added to your SideBet balance. The card
            processing fee is charged by our payment processor and passed through at cost.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.payButton, (!isAmountValid || isProcessing) && styles.payButtonDisabled]}
        onPress={handlePay}
        disabled={!isAmountValid || isProcessing}
        activeOpacity={0.8}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <>
            <Ionicons name="card-outline" size={20} color={colors.background} />
            <Text style={styles.payButtonText}>
              Pay {isAmountValid ? `$${totalCharge.toFixed(2)}` : ''}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.secureNote}>
        <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} /> Secured by Stripe · Card, Apple Pay, Google Pay accepted
      </Text>
    </ScrollView>
  );

  const renderSuccess = () => (
    <View style={styles.successContainer}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark-circle" size={80} color={colors.success} />
      </View>
      <Text style={styles.successTitle}>Payment Confirmed!</Text>
      <Text style={styles.successSubtitle}>
        ${numAmount.toFixed(2)} is being added to your balance. It will appear within a few seconds.
      </Text>
      <TouchableOpacity style={styles.payButton} onPress={handleClose} activeOpacity={0.8}>
        <Text style={styles.payButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ModalHeader title="Add Funds" onClose={handleClose} />
          {didSucceed ? renderSuccess() : renderAmountEntry()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    // Prevents any overflowing child from scrolling the viewport sideways
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepContentContainer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    // Keep content within the viewport on wide screens so nothing can push
    // the layout horizontally
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Amount input
  inputSection: {
    marginBottom: spacing.lg,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
  },
  amountInputContainerFocused: {
    borderColor: colors.primary,
  },
  currencySymbol: {
    fontSize: typography.fontSize['2xl'],
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
    marginRight: spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: typography.fontSize['2xl'],
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
    paddingVertical: spacing.md,
  },
  inputHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Fee card
  feeCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  feeLabel: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    // Wrap long labels instead of widening the row past the container
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  feeValue: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    flexShrink: 0,
  },
  feeWaived: {
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  feeDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  feeTotalLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  feeTotalValue: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    flexShrink: 0,
  },
  feeNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  // Pro banner
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  proBannerText: {
    ...textStyles.caption,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
    flexShrink: 1,
  },

  // Pay button
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    marginBottom: spacing.md,
  },
  payButtonDisabled: {
    backgroundColor: colors.border,
  },
  payButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.xs,
  },
  secureNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Success state
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  successIcon: {
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
});
