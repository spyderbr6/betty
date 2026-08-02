/**
 * Add Funds Modal — Stripe card payment flow
 * Replaces the old manual Venmo reconciliation flow.
 */

import React, { useRef, useState } from 'react';
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
import {
  createPaymentIntent,
  calculateDepositCharge,
  waitForDepositToSettle,
} from '../../services/stripeService';

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
  // 'waiting'   — Stripe took the money, the webhook has not credited the balance yet
  // 'confirmed' — the deposit's Transaction row reached COMPLETED; balance is real
  // 'slow'      — settlement outstripped our wait; the payment is fine, the credit is late
  const [settleState, setSettleState] = useState<'waiting' | 'confirmed' | 'slow'>('waiting');
  const [newBalance, setNewBalance] = useState<number | null>(null);

  // Identifies the in-flight settlement wait. Bumped on reset, so a poll that outlives its
  // modal (user tapped Done early, or started another deposit) resolves into a no-op
  // instead of writing state for a payment that is no longer on screen.
  const settleRunRef = useRef(0);

  const numAmount = parseFloat(amount) || 0;
  const { processingFee, totalCharge } = calculateDepositCharge(numAmount);
  const isAmountValid = numAmount >= MIN_DEPOSIT && numAmount <= MAX_DEPOSIT;

  const resetState = () => {
    settleRunRef.current += 1;
    setAmount('');
    setIsProcessing(false);
    setDidSucceed(false);
    setSettleState('waiting');
    setNewBalance(null);
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

      // 4. Payment confirmed by Stripe. The balance is NOT credited yet — that happens
      //    out of band when the stripe-webhook Lambda settles the Transaction row. Show
      //    the confirmation screen in its waiting state and watch for the actual credit,
      //    rather than claiming the money landed and hoping it did.
      setDidSucceed(true);
      setSettleState('waiting');
      setIsProcessing(false);

      // Tell the parent straight away that a payment succeeded — before waiting on the
      // credit. Onboarding keys its "may advance" flag off this, and the user can dismiss
      // this screen mid-wait; deferring it would lose their progress after they had paid.
      onSuccess?.();

      const runId = ++settleRunRef.current;
      const settlement = await waitForDepositToSettle(intentData.transactionId);

      // The user moved on (closed the modal, or started another deposit). Their balance
      // still updates; there is just no longer a screen for this result to land on.
      if (settleRunRef.current !== runId) return;

      if (settlement.status === 'COMPLETED') {
        setNewBalance(settlement.balanceAfter);
        setSettleState('confirmed');
      } else {
        if (settlement.status === 'FAILED') {
          console.error('[AddFundsModal] Deposit did not settle:', intentData.transactionId);
        }
        // TIMEOUT and FAILED both land here deliberately. Stripe has the money either way,
        // so "it did not work" would be false and alarming — a slow webhook and a failed
        // settlement look identical from here, and both resolve through the same admin
        // approval queue. Say what is certainly true and leave the balance unclaimed.
        setSettleState('slow');
      }

      // Fire again now that the balance has actually moved, so the screen behind re-reads
      // a credited balance rather than the still-PENDING one it saw a moment ago.
      onSuccess?.();
    } catch (err) {
      console.error('[AddFundsModal] Payment error:', err);
      showAlert('Error', 'Something went wrong. Please try again.');
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

  const renderSuccess = () => {
    const confirmed = settleState === 'confirmed';
    const waiting = settleState === 'waiting';

    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          {waiting ? (
            <ActivityIndicator size="large" color={colors.success} />
          ) : (
            <Ionicons
              name={confirmed ? 'checkmark-circle' : 'time-outline'}
              size={80}
              color={confirmed ? colors.success : colors.warning}
            />
          )}
        </View>

        <Text style={styles.successTitle}>
          {confirmed ? 'Funds Added!' : waiting ? 'Payment Confirmed' : 'Payment Received'}
        </Text>

        <Text style={styles.successSubtitle}>
          {confirmed
            ? `$${numAmount.toFixed(2)} was added to your balance.`
            : waiting
              ? `Adding $${numAmount.toFixed(2)} to your balance…`
              : `Your payment went through, but the balance is taking longer than usual to update. $${numAmount.toFixed(2)} will appear shortly — you can safely close this.`}
        </Text>

        {confirmed && newBalance !== null && (
          <View style={styles.newBalanceRow}>
            <Text style={styles.newBalanceLabel}>New balance</Text>
            <Text style={styles.newBalanceValue}>${newBalance.toFixed(2)}</Text>
          </View>
        )}

        {/* Deliberately enabled while waiting. The credit lands regardless of whether this
            screen is open, so blocking Done would trap the user for no benefit. */}
        <TouchableOpacity style={styles.payButton} onPress={handleClose} activeOpacity={0.8}>
          <Text style={styles.payButtonText}>{waiting ? 'Close' : 'Done'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
  newBalanceRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  newBalanceLabel: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  newBalanceValue: {
    ...textStyles.balance,
    color: colors.success,
  },
});
