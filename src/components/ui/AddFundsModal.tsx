/**
 * Add Funds Modal Component
 * Allows users to add funds via Venmo with transaction verification
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
import { showAlert } from './CustomAlert';
import { TransactionService } from '../../services/transactionService';
import { PaymentMethodService } from '../../services/paymentMethodService';
import type { PaymentMethod } from '../../services/paymentMethodService';

interface AddFundsModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onAddPaymentMethod?: () => void;
}

const APP_VENMO_USERNAME = '@PropBets'; // Replace with actual app Venmo username
const MIN_DEPOSIT = 5;
const MAX_DEPOSIT = 500;

export const AddFundsModal: React.FC<AddFundsModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onAddPaymentMethod,
}) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [venmoTransactionId, setVenmoTransactionId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<'select_method' | 'enter_details' | 'confirmation'>('select_method');
  const [amountFocused, setAmountFocused] = useState(false);

  // Load payment methods when modal opens
  useEffect(() => {
    if (visible && user?.userId) {
      loadPaymentMethods();
    } else {
      // Reset state when modal closes
      setAmount('');
      setVenmoTransactionId('');
      setSelectedPaymentMethod(null);
      setStep('select_method');
    }
  }, [visible, user?.userId]);

  const loadPaymentMethods = async () => {
    if (!user?.userId) return;

    try {
      setIsLoadingMethods(true);
      const methods = await PaymentMethodService.getUserPaymentMethods(user.userId);
      const venmoMethods = methods.filter(m => m.type === 'VENMO');
      setPaymentMethods(venmoMethods);

      // Auto-select default or first method
      const defaultMethod = venmoMethods.find(m => m.isDefault) || venmoMethods[0];
      if (defaultMethod) {
        setSelectedPaymentMethod(defaultMethod);
      }
    } catch (error) {
      console.error('Error loading payment methods:', error);
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const validateAmount = (): boolean => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < MIN_DEPOSIT) {
      showAlert('Invalid Amount', `Minimum deposit is $${MIN_DEPOSIT.toFixed(2)}`);
      return false;
    }
    if (numAmount > MAX_DEPOSIT) {
      showAlert('Invalid Amount', `Maximum deposit is $${MAX_DEPOSIT.toFixed(2)}`);
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (step === 'select_method') {
      if (!selectedPaymentMethod) {
        showAlert('Select Payment Method', 'Please select a Venmo account or add a new one');
        return;
      }
      setStep('enter_details');
    } else if (step === 'enter_details') {
      if (!validateAmount()) return;
      if (!venmoTransactionId.trim()) {
        showAlert('Transaction ID Required', 'Please enter your Venmo transaction ID');
        return;
      }
      setStep('confirmation');
    }
  };

  const handleBack = () => {
    if (step === 'enter_details') {
      setStep('select_method');
    } else if (step === 'confirmation') {
      setStep('enter_details');
    }
  };

  const handleSubmit = async () => {
    if (!user?.userId || !selectedPaymentMethod) return;

    try {
      setIsSubmitting(true);

      const numAmount = parseFloat(amount);

      // Create pending deposit transaction
      const transaction = await TransactionService.createDeposit(
        user.userId,
        numAmount,
        selectedPaymentMethod.id,
        venmoTransactionId,
        selectedPaymentMethod.venmoUsername
      );

      if (!transaction) {
        setIsSubmitting(false);
        showAlert('Error', 'Failed to create deposit request. Please try again.');
        return;
      }

      // Update last used timestamp
      await PaymentMethodService.updateLastUsed(selectedPaymentMethod.id);

      // Close modal immediately
      onClose();

      // Show success message after modal is closed
      setTimeout(() => {
        showAlert(
          'Deposit Request Submitted',
          'Your deposit request has been submitted! We\'ll verify your Venmo payment and credit your account shortly. You\'ll receive a notification when it\'s complete.',
          [{ text: 'OK' }]
        );
      }, 300);

      // Trigger success callback (refreshes parent data)
      onSuccess?.();
    } catch (error) {
      console.error('Error submitting deposit:', error);
      setIsSubmitting(false);
      showAlert('Error', 'Failed to submit deposit request. Please try again.');
    }
  };

  const renderSelectMethod = () => (
    <ScrollView style={styles.stepContent} contentContainerStyle={styles.stepContentContainer} showsVerticalScrollIndicator={false}>
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
                  {method.isVerified && (
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  )}
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
          <Ionicons name="card-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Payment Methods</Text>
          <Text style={styles.emptyDescription}>
            You need to add a Venmo account before you can deposit funds
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

  const renderEnterDetails = () => (
    <ScrollView style={styles.stepContent} contentContainerStyle={styles.stepContentContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>DEPOSIT DETAILS</Text>

      {/* Amount Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Amount to Deposit</Text>
        <View style={[styles.amountInputContainer, amountFocused && styles.amountInputContainerFocused]}>
          <Text style={styles.currencySymbol}>$</Text>
          <View style={styles.amountInputWrapper}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              autoFocus
            />
          </View>
        </View>
        <Text style={styles.inputHint}>
          Min: ${MIN_DEPOSIT.toFixed(2)} • Max: ${MAX_DEPOSIT.toFixed(2)}
        </Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsBox}>
        <Ionicons name="information-circle" size={24} color={colors.info} />
        <View style={styles.instructionsContent}>
          <Text style={styles.instructionsTitle}>How to Deposit</Text>
          <Text style={styles.instructionsText}>
            1. Open Venmo and send ${amount || '0.00'} to {APP_VENMO_USERNAME}
            {'\n'}2. Add note: "SideBet Deposit"
            {'\n'}3. Copy the transaction ID from Venmo
            {'\n'}4. Paste it below for verification
            {'\n'}5. Our team will verify and approve within 1-2 hours
            {'\n'}{'\n'}Note: Venmo may charge fees. You'll be credited with the actual amount received.
          </Text>
        </View>
      </View>

      {/* Transaction ID Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Venmo Transaction ID</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., 3FA12345678"
          placeholderTextColor={colors.textMuted}
          value={venmoTransactionId}
          onChangeText={setVenmoTransactionId}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Text style={styles.inputHint}>
          Find this in your Venmo transaction details
        </Text>
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
    <ScrollView style={styles.stepContent} contentContainerStyle={styles.stepContentContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>CONFIRM DEPOSIT</Text>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Amount</Text>
          <Text style={styles.summaryValue}>${parseFloat(amount).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Payment Method</Text>
          <Text style={styles.summaryValue}>{selectedPaymentMethod?.displayName}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Transaction ID</Text>
          <Text style={[styles.summaryValue, styles.transactionId]}>{venmoTransactionId}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Status</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Pending Verification</Text>
          </View>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="alert-circle-outline" size={24} color={colors.warning} />
        <View style={styles.warningContent}>
          <Text style={styles.warningTitle}>Manual Verification Required</Text>
          <Text style={styles.warningText}>
            Our team will manually verify your Venmo payment and credit your account within 1-2 hours. You'll receive a notification when your deposit is approved and available for betting.
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
              <Text style={styles.submitButtonText}>Submit Request</Text>
              <Ionicons name="checkmark" size={20} color={colors.background} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ModalHeader title="Add Funds" onClose={onClose} />

          {/* Step Indicator */}
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <View style={[styles.stepDot, (step === 'enter_details' || step === 'confirmation') && styles.stepDotActive]} />
            <View style={[styles.stepDot, step === 'confirmation' && styles.stepDotActive]} />
          </View>

          {step === 'select_method' && renderSelectMethod()}
          {step === 'enter_details' && renderEnterDetails()}
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
  },
  stepContentContainer: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
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
    marginBottom: spacing.lg,
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
  },
  amountInputWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  amountInput: {
    fontSize: typography.fontSize['2xl'],
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
    paddingVertical: spacing.md,
    marginLeft: spacing.xs,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  },
  inputHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Instructions
  instructionsBox: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.info + '40',
  },
  instructionsContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  instructionsTitle: {
    ...textStyles.button,
    color: colors.info,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  instructionsText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 20,
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
  transactionId: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.fontSize.sm,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  statusBadge: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    fontSize: 12,
  },

  // Warning Banner
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
    backgroundColor: colors.success,
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
