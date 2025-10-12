/**
 * Add Payment Method Modal Component
 * Allows users to add a Venmo account as a payment method
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
import { PaymentMethodService } from '../../services/paymentMethodService';

interface AddPaymentMethodModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddPaymentMethodModal: React.FC<AddPaymentMethodModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [venmoUsername, setVenmoUsername] = useState('');
  const [venmoEmail, setVenmoEmail] = useState('');
  const [venmoPhone, setVenmoPhone] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  // Reset state when modal closes
  React.useEffect(() => {
    if (!visible) {
      setVenmoUsername('');
      setVenmoEmail('');
      setVenmoPhone('');
      setIsDefault(false);
      setUsernameError('');
    }
  }, [visible]);

  const validateUsername = (username: string): boolean => {
    if (!username.trim()) {
      setUsernameError('Venmo username is required');
      return false;
    }

    if (!PaymentMethodService.validateVenmoUsername(username)) {
      setUsernameError('Username must be 5-30 characters (letters, numbers, hyphens, underscores)');
      return false;
    }

    setUsernameError('');
    return true;
  };

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    if (!phone.trim()) return true; // Phone is optional
    // Allow only 4 digits for last 4 of phone
    return /^\d{4}$/.test(phone);
  };

  const handleSubmit = async () => {
    if (!user?.userId) return;

    // Validate all fields
    if (!validateUsername(venmoUsername)) return;

    if (venmoEmail && !validateEmail(venmoEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (venmoPhone && !validatePhone(venmoPhone)) {
      Alert.alert('Invalid Phone', 'Please enter the last 4 digits of your phone number');
      return;
    }

    try {
      setIsSubmitting(true);

      const formattedUsername = PaymentMethodService.formatVenmoUsername(venmoUsername);

      const paymentMethod = await PaymentMethodService.createPaymentMethod({
        userId: user.userId,
        type: 'VENMO',
        venmoUsername: formattedUsername,
        venmoEmail: venmoEmail.trim() || undefined,
        venmoPhone: venmoPhone.trim() || undefined,
        isDefault,
      });

      if (!paymentMethod) {
        Alert.alert('Error', 'Failed to add payment method. Please try again.');
        return;
      }

      Alert.alert(
        'Payment Method Added',
        'Your Venmo account has been added successfully! It will need to be verified before you can withdraw funds.',
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
      console.error('Error adding payment method:', error);
      Alert.alert('Error', 'Failed to add payment method. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ModalHeader
            title="Add Payment Method"
            onClose={onClose}
            rightComponent={
              <TouchableOpacity
                style={[styles.saveButton, (!venmoUsername || usernameError || isSubmitting) && styles.saveButtonDisabled]}
                onPress={handleSubmit}
                disabled={!venmoUsername || !!usernameError || isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.saveButtonText, (!venmoUsername || usernameError) && styles.saveButtonTextDisabled]}>
                    Add
                  </Text>
                )}
              </TouchableOpacity>
            }
          />

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Payment Type Selector */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PAYMENT TYPE</Text>
              <View style={styles.paymentTypeCard}>
                <View style={styles.paymentTypeIcon}>
                  <Ionicons name="logo-venmo" size={32} color={colors.primary} />
                </View>
                <View style={styles.paymentTypeInfo}>
                  <Text style={styles.paymentTypeName}>Venmo</Text>
                  <Text style={styles.paymentTypeDescription}>
                    Fast and secure peer-to-peer payments
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              </View>
            </View>

            {/* Venmo Username */}
            <View style={styles.section}>
              <Text style={styles.inputLabel}>
                Venmo Username <Text style={styles.required}>*</Text>
              </Text>
              <View style={[styles.inputContainer, usernameError && styles.inputContainerError]}>
                <Text style={styles.inputPrefix}>@</Text>
                <TextInput
                  style={styles.input}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  value={venmoUsername}
                  onChangeText={(text) => {
                    setVenmoUsername(text);
                    validateUsername(text);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              {usernameError ? (
                <Text style={styles.errorText}>{usernameError}</Text>
              ) : (
                <Text style={styles.inputHint}>
                  Your Venmo username (without the @ symbol)
                </Text>
              )}
            </View>

            {/* Venmo Email (Optional) */}
            <View style={styles.section}>
              <Text style={styles.inputLabel}>Email (Optional)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={venmoEmail}
                  onChangeText={setVenmoEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.inputHint}>
                Email associated with your Venmo account
              </Text>
            </View>

            {/* Phone Last 4 (Optional) */}
            <View style={styles.section}>
              <Text style={styles.inputLabel}>Phone Last 4 Digits (Optional)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <Text style={styles.inputPrefix}>***-***-</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1234"
                  placeholderTextColor={colors.textMuted}
                  value={venmoPhone}
                  onChangeText={setVenmoPhone}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <Text style={styles.inputHint}>
                Last 4 digits for verification purposes
              </Text>
            </View>

            {/* Set as Default */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsDefault(!isDefault)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isDefault && styles.checkboxChecked]}>
                  {isDefault && <Ionicons name="checkmark" size={18} color={colors.background} />}
                </View>
                <View style={styles.checkboxLabel}>
                  <Text style={styles.checkboxText}>Set as default payment method</Text>
                  <Text style={styles.checkboxHint}>
                    Use this account for all transactions by default
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={24} color={colors.info} />
              <View style={styles.infoBannerContent}>
                <Text style={styles.infoBannerTitle}>Verification Required</Text>
                <Text style={styles.infoBannerText}>
                  Your Venmo account will need to be verified before you can withdraw funds. You can deposit funds immediately after adding your account.
                </Text>
              </View>
            </View>

            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
              <Text style={styles.securityText}>
                Your payment information is encrypted and stored securely
              </Text>
            </View>
          </ScrollView>
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
  scrollContent: {
    flex: 1,
    padding: spacing.lg,
  },

  // Sections
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Payment Type Card
  paymentTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  paymentTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  paymentTypeInfo: {
    flex: 1,
  },
  paymentTypeName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  paymentTypeDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },

  // Input Fields
  inputLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  required: {
    color: colors.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
  },
  inputContainerError: {
    borderColor: colors.error,
    borderWidth: 2,
  },
  inputPrefix: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs / 2,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    paddingVertical: spacing.sm,
  },
  inputHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  errorText: {
    ...textStyles.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: spacing.radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    flex: 1,
  },
  checkboxText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs / 2,
  },
  checkboxHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: colors.info + '20',
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
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

  // Security Notice
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  securityText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },

  // Header Buttons
  saveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  saveButtonTextDisabled: {
    color: colors.textMuted,
  },
});
