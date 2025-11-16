/**
 * Verify Phone Modal Component
 * Modal for entering SMS verification code sent to phone number
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, textStyles, commonStyles } from '../../styles';
import { ModalHeader } from './ModalHeader';
import { verifyCode, resendVerificationCode } from '../../services/phoneVerificationService';
import { formatDisplayPhone } from '../../utils/phoneValidation';

interface VerifyPhoneModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  phoneNumber: string; // E.164 format
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds
const CODE_EXPIRY = 300; // 5 minutes in seconds

export const VerifyPhoneModal: React.FC<VerifyPhoneModalProps> = ({
  visible,
  onClose,
  onSuccess,
  phoneNumber,
}) => {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(CODE_EXPIRY);
  const codeInputRef = useRef<TextInput>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCode('');
      setError('');
      setResendCooldown(0);
      setTimeRemaining(CODE_EXPIRY);
      // Auto-focus the input when modal opens
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 500);
    }
  }, [visible]);

  // Countdown timer for code expiration
  useEffect(() => {
    if (!visible || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, timeRemaining]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCodeChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '');

    // Limit to CODE_LENGTH digits
    const trimmed = cleaned.slice(0, CODE_LENGTH);

    setCode(trimmed);
    setError('');

    // Auto-verify when code is complete
    if (trimmed.length === CODE_LENGTH) {
      handleVerify(trimmed);
    }
  };

  const handleVerify = async (verificationCode?: string) => {
    const codeToVerify = verificationCode || code;

    if (codeToVerify.length !== CODE_LENGTH) {
      setError(`Please enter the ${CODE_LENGTH}-digit code`);
      return;
    }

    if (timeRemaining <= 0) {
      setError('Verification code has expired. Please request a new code.');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const result = await verifyCode(codeToVerify);

      if (result.success) {
        // Success! Call onSuccess callback
        onSuccess();
      } else {
        setError(result.error || 'Verification failed. Please try again.');
        setCode(''); // Clear code on error
      }
    } catch (err) {
      console.error('[VerifyPhoneModal] Verification error:', err);
      setError('An error occurred. Please try again.');
      setCode(''); // Clear code on error
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) {
      return;
    }

    setResendCooldown(RESEND_COOLDOWN);
    setError('');
    setCode('');
    setTimeRemaining(CODE_EXPIRY); // Reset expiry timer

    try {
      const result = await resendVerificationCode();

      if (result.success) {
        showAlert(
          'Code Sent',
          `A new verification code has been sent to ${result.destination || 'your phone'}`,
          [{ text: 'OK' }]
        );
      } else {
        setError(result.error || 'Failed to resend code');
        setResendCooldown(0); // Reset cooldown on error
      }
    } catch (err) {
      console.error('[VerifyPhoneModal] Resend error:', err);
      setError('Failed to resend code. Please try again.');
      setResendCooldown(0); // Reset cooldown on error
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayPhoneNumber = formatDisplayPhone(phoneNumber, 'international');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Verify Phone Number" onClose={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.contentInner}>
            {/* Header Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="phone-portrait-outline" size={64} color={colors.primary} />
            </View>

            {/* Instructions */}
            <Text style={styles.title}>Enter Verification Code</Text>
            <Text style={styles.subtitle}>
              We sent a {CODE_LENGTH}-digit code to{'\n'}
              <Text style={styles.phoneNumber}>{displayPhoneNumber}</Text>
            </Text>

            {/* Code Input */}
            <View style={styles.codeInputContainer}>
              <TextInput
                ref={codeInputRef}
                style={styles.codeInput}
                value={code}
                onChangeText={handleCodeChange}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                autoFocus
                placeholder="000000"
                placeholderTextColor={colors.textMuted}
                editable={!isVerifying && timeRemaining > 0}
                textAlign="center"
              />
              {isVerifying && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Timer */}
            {timeRemaining > 0 ? (
              <Text style={styles.timer}>
                Code expires in {formatTime(timeRemaining)}
              </Text>
            ) : (
              <Text style={styles.expiredText}>
                Code expired. Please request a new code.
              </Text>
            )}

            {/* Resend Button */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendLabel}>Didn't receive the code?</Text>
              <TouchableOpacity
                style={[
                  styles.resendButton,
                  resendCooldown > 0 && styles.resendButtonDisabled,
                ]}
                onPress={handleResend}
                disabled={resendCooldown > 0}
              >
                <Text style={[
                  styles.resendButtonText,
                  resendCooldown > 0 && styles.resendButtonTextDisabled,
                ]}>
                  {resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend Code'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Manual Verify Button (backup if auto-verify fails) */}
            {code.length === CODE_LENGTH && !isVerifying && (
              <TouchableOpacity
                style={styles.verifyButton}
                onPress={() => handleVerify()}
              >
                <Text style={styles.verifyButtonText}>Verify</Text>
              </TouchableOpacity>
            )}
          </View>
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
  contentInner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  phoneNumber: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  codeInputContainer: {
    width: '100%',
    maxWidth: 280,
    marginBottom: spacing.md,
    position: 'relative',
  },
  codeInput: {
    ...textStyles.h2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
    letterSpacing: 8,
    color: colors.textPrimary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: spacing.radius.md,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error,
    marginLeft: spacing.xs,
    flex: 1,
  },
  timer: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  expiredText: {
    ...textStyles.caption,
    color: colors.error,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.lg,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  resendLabel: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  resendButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    ...textStyles.button,
    color: colors.primary,
  },
  resendButtonTextDisabled: {
    color: colors.textMuted,
  },
  verifyButton: {
    ...commonStyles.primaryButton,
    width: '100%',
    maxWidth: 280,
    marginTop: spacing.md,
  },
  verifyButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
  },
});
