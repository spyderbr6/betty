/**
 * Withdraw Funds Modal Component
 * Allows users to withdraw funds to their Venmo account
 */

import React, { useState, useEffect } from 'react';
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
import { TransactionService } from '../../services/transactionService';
import { PaymentMethodService } from '../../services/paymentMethodService';
import type { PaymentMethod } from '../../services/paymentMethodService';
import { formatCurrency } from '../../utils/formatting';
import { showAlert } from './CustomAlert';

interface WithdrawFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onAddPaymentMethod?: () => void;
}

const MIN_WITHDRAWAL = 10;
const WITHDRAWAL_FEE_PERCENT = 0; // 0% fee for now, can be changed later

export const WithdrawFundsModal: React.FC<WithdrawFundsModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onAddPaymentMethod,
}) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [userBalance, setUserBalance] = useState(0);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'select_method' | 'enter_amount' | 'confirmation'>('select_method');

  // Load payment methods and user balance when modal opens
  useEffect(() => {
    if (visible && user?.userId) {
      loadData();
    } else {
      // Reset state when modal closes
      setAmount('');
      setSelectedPaymentMethod(null);
      setStep('select_method');
    }
  }, [visible, user?.userId]);

  const loadData = async () => {
    if (!user?.userId) return;

    try {
      setIsLoadingMethods(true);

      // Load payment methods and balance in parallel
      const [methods, balance] = await Promise.all([
        PaymentMethodService.getUserPaymentMethods(user.userId),
        TransactionService.getUserBalance(user.userId),
      ]);

      const venmoMethods = methods.filter(m => m.type === 'VENMO' && m.isVerified);
      setPaymentMethods(venmoMethods);
      setUserBalance(balance);

      // Auto-select default or first verified method
      const defaultMethod = venmoMethods.find(m => m.isDefault) || venmoMethods[0];
      if (defaultMethod) {
        setSelectedPaymentMethod(defaultMethod);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const calculateFee = (amount: number): number => {
    return amount * (WITHDRAWAL_FEE_PERCENT / 100);
  };

  const calculateTotal = (amount: number): number => {
    return amount - calculateFee(amount);
  };

  const validateAmount = (): boolean => {
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount');
      return false;
    }

    if (numAmount < MIN_WITHDRAWAL) {
      showAlert('Invalid Amount', `Minimum withdrawal is ${formatCurrency(MIN_WITHDRAWAL)}`);
      return false;
    }

    if (numAmount > userBalance) {
      showAlert('Insufficient Balance', `You only have ${formatCurrency(userBalance)} available`);
      return false;
    }

    return true;
  };

  const handleContinue = () => {
    if (step === 'select_method') {
      if (!selectedPaymentMethod) {
        showAlert('Select Payment Method', 'Please select a verified Venmo account');
        return;
      }
      setStep('enter_amount');
    } else if (step === 'enter_amount') {
      if (!validateAmount()) return;
      setStep('confirmation');
    }
  };

  const handleBack = () => {
    if (step === 'enter_amount') {
      setStep('select_method');
    } else if (step === 'confirmation') {
      setStep('enter_amount');
    }
  };

  const handleSubmit = async () => {
    if (!user?.userId || !selectedPaymentMethod) return;

    try {
      setIsSubmitting(true);

      const numAmount = parseFloat(amount);

      // Create pending withdrawal transaction
      const transaction = await TransactionService.createWithdrawal(
        user.userId,
        numAmount,
        selectedPaymentMethod.id,
        selectedPaymentMethod.venmoUsername || ''
      );

      if (!transaction) {
        showAlert('Error', 'Failed to create withdrawal request. Please try again.');
        return;
      }

      // Update last used timestamp
      await PaymentMethodService.updateLastUsed(selectedPaymentMethod.id);

      showAlert(
        'Withdrawal Pending',
        `Your withdrawal request for ${formatCurrency(numAmount)} has been submitted! We'll process it within 1-2 business days and send the funds to your Venmo account. You'll receive a notification when it's complete.`,
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting withdrawal:', error);
      showAlert('Error', 'Failed to submit withdrawal request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAmount = (percent: number) => {
    const quickAmount = (userBalance * percent) / 100;
    setAmount(quickAmount.toFixed(2));
  };

  const renderSelectMethod = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>SELECT VENMO ACCOUNT</Text>

      {isLoadingMethods ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : paymentMethods.length > 0 ? (
        <View style={styles.methodsList}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.methodCard,
                selectedPaymentMethod?.id === method.id && styles.methodCardSelected,
              ]}
              onPress={() => setSelectedPaymentMethod(method)}
              activeOpacity={0.7}
            >
              <View style={styles.methodInfo}>
                <View style={styles.methodIconContainer}>
                  <Ionicons name="logo-venmo" size={24} color={colors.primary} />
                </View>
                <View style={styles.methodDetails}>
                  <Text style={styles.methodName}>{method.displayName}</Text>
                  <Text style={styles.methodUsername}>{method.venmoUsername}</Text>
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                </View>
              </View>
              {selectedPaymentMethod?.id === method.id && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.warning} />
          <Text style={styles.emptyTitle}>No Verified Accounts</Text>
          <Text style={styles.emptyDescription}>
            You need a verified Venmo account before you can withdraw funds. Please add and verify a payment method first.
          </Text>
          <TouchableOpacity
            style={styles.addMethodButton}
            onPress={() => {
              onClose();
              setTimeout(() => onAddPaymentMethod?.(), 300);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color={colors.background} />
            <Text style={styles.addMethodButtonText}>Add Venmo Account</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={[styles.continueButton, !selectedPaymentMethod && styles.continueButtonDisabled]}
        onPress={handleContinue}
        disabled={!selectedPaymentMethod}
        activeOpacity={0.8}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.background} />
      </TouchableOpacity>
    </ScrollView>
  );

  const renderEnterAmount = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>WITHDRAWAL DETAILS</Text>

      {/* Available Balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>{formatCurrency(userBalance)}</Text>
      </View>

      {/* Amount Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Amount to Withdraw</Text>
        <View style={styles.amountInputContainer}>
          <Text style={styles.currencySymbol}>$</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
        </View>
        <Text style={styles.inputHint}>
          Min: {formatCurrency(MIN_WITHDRAWAL)} • Available: {formatCurrency(userBalance)}
        </Text>
      </View>

      {/* Quick Amount Buttons */}
      <View style={styles.quickAmountSection}>
        <Text style={styles.quickAmountLabel}>Quick Select</Text>
        <View style={styles.quickAmountButtons}>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() => handleQuickAmount(25)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickAmountButtonText}>25%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() => handleQuickAmount(50)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickAmountButtonText}>50%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() => handleQuickAmount(75)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickAmountButtonText}>75%</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAmountButton}
            onPress={() => handleQuickAmount(100)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickAmountButtonText}>Max</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fee Breakdown */}
      {amount && parseFloat(amount) > 0 && (
        <View style={styles.feeBreakdown}>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Withdrawal Amount</Text>
            <Text style={styles.feeValue}>{formatCurrency(parseFloat(amount))}</Text>
          </View>
          {WITHDRAWAL_FEE_PERCENT > 0 && (
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Fee ({WITHDRAWAL_FEE_PERCENT}%)</Text>
              <Text style={styles.feeValue}>-{formatCurrency(calculateFee(parseFloat(amount)))}</Text>
            </View>
          )}
          <View style={styles.feeDivider} />
          <View style={styles.feeRow}>
            <Text style={styles.feeTotalLabel}>You'll Receive</Text>
            <Text style={styles.feeTotalValue}>{formatCurrency(calculateTotal(parseFloat(amount)))}</Text>
          </View>
        </View>
      )}

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={24} color={colors.info} />
        <View style={styles.infoBannerContent}>
          <Text style={styles.infoBannerTitle}>Processing Time</Text>
          <Text style={styles.infoBannerText}>
            Withdrawals are typically processed within 1-2 business days. You'll receive a notification when the funds have been sent to your Venmo account.
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueButton, styles.continueButtonFlex]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Review</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderConfirmation = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>CONFIRM WITHDRAWAL</Text>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Withdrawal Amount</Text>
          <Text style={styles.summaryValue}>{formatCurrency(parseFloat(amount))}</Text>
        </View>
        {WITHDRAWAL_FEE_PERCENT > 0 && (
          <>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing Fee</Text>
              <Text style={styles.summaryValue}>-{formatCurrency(calculateFee(parseFloat(amount)))}</Text>
            </View>
          </>
        )}
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabelBold}>You'll Receive</Text>
          <Text style={styles.summaryValueBold}>{formatCurrency(calculateTotal(parseFloat(amount)))}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Venmo Account</Text>
          <Text style={styles.summaryValue}>{selectedPaymentMethod?.venmoUsername}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Processing Time</Text>
          <Text style={styles.summaryValue}>1-2 business days</Text>
        </View>
      </View>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="alert-circle-outline" size={24} color={colors.warning} />
        <View style={styles.warningContent}>
          <Text style={styles.warningTitle}>Withdrawal Notice</Text>
          <Text style={styles.warningText}>
            Your withdrawal request will be reviewed and processed within 1-2 business days. Funds will be sent to your verified Venmo account. You cannot cancel this request once submitted.
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Confirm Withdrawal</Text>
              <Ionicons name="checkmark" size={20} color={colors.background} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ModalHeader title="Withdraw Funds" onClose={onClose} />

          {/* Step Indicator */}
          <View style={styles.stepIndicator}>
            <View style={styles.stepDot} />
            <View style={[styles.stepDot, (step === 'enter_amount' || step === 'confirmation') && styles.stepDotActive]} />
            <View style={[styles.stepDot, step === 'confirmation' && styles.stepDotActive]} />
          </View>

          {step === 'select_method' && renderSelectMethod()}
          {step === 'enter_amount' && renderEnterAmount()}
          {step === 'confirmation' && renderConfirmation()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },

  // Content
  stepContent: {
    flex: 1,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },

  // Balance Card
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  balanceAmount: {
    ...textStyles.h1,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },

  // Payment Methods
  methodsList: {
    marginBottom: spacing.lg,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
  },
  methodCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  methodIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  methodDetails: {
    flex: 1,
  },
  methodName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  methodUsername: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedText: {
    ...textStyles.caption,
    color: colors.success,
    marginLeft: spacing.xs / 2,
    fontSize: 12,
  },

  // Input Sections
  inputSection: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
  },
  currencySymbol: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  amountInput: {
    flex: 1,
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    paddingVertical: spacing.md,
    marginLeft: spacing.xs,
  },
  inputHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Quick Amount
  quickAmountSection: {
    marginBottom: spacing.lg,
  },
  quickAmountLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  quickAmountButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginHorizontal: spacing.xs / 2,
  },
  quickAmountButtonText: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },

  // Fee Breakdown
  feeBreakdown: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  feeLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  feeValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  feeDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  feeTotalLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  feeTotalValue: {
    ...textStyles.button,
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },

  // Info/Warning Banners
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.info + '40',
  },
  infoBannerContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  infoBannerTitle: {
    ...textStyles.button,
    color: colors.info,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  infoBannerText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: colors.warning + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  warningContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  warningTitle: {
    ...textStyles.button,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  warningText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Summary
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryLabelBold: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  summaryValueBold: {
    ...textStyles.button,
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.lg,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  continueButtonFlex: {
    flex: 1,
  },
  continueButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  continueButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginRight: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  submitButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginRight: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    lineHeight: 24,
  },
  addMethodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    marginTop: spacing.md,
  },
  addMethodButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
