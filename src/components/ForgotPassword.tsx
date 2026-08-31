import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import { colors, spacing, textStyles, typography, commonStyles, shadows } from '../styles';
import { showAlert } from './ui/CustomAlert';

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

// Cognito's default password policy for this user pool: 8+ characters with a
// lowercase letter, an uppercase letter, a number and a symbol. Only the length
// is checked here — Cognito is the authority on the rest, and its
// InvalidPasswordException message is surfaced verbatim so the user sees the
// actual rule they missed rather than our paraphrase of it.
const MIN_PASSWORD_LENGTH = 8;

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBackToLogin }) => {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [destination, setDestination] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string>('');

  const handleRequestCode = async (isResend = false) => {
    setErrorMessage('');
    setInfoMessage('');

    if (!email.trim()) {
      setErrorMessage('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      const output = await resetPassword({ username: email.trim() });

      if (output.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
        setDestination(output.nextStep.codeDeliveryDetails?.destination ?? '');
        setStep('confirm');
        if (isResend) {
          setInfoMessage('A new code is on its way.');
        }
      } else {
        // 'DONE' — Cognito considers the reset already complete, so there is no
        // code to enter. Send the user back to sign in rather than showing them
        // a code field that will never accept anything.
        showAlert(
          'Password Reset',
          'Your password has already been reset. Please sign in.',
          [{ text: 'Sign In', style: 'default', onPress: onBackToLogin }]
        );
      }
    } catch (error) {
      const err = error as Error & { name?: string };
      console.error('Reset password request error:', err?.name, err?.message);

      if (err.name === 'UserNotFoundException') {
        // Don't confirm or deny that the account exists — advance to the code
        // step exactly as we would for a real account. This matches what Cognito
        // itself does when the app client has preventUserExistenceErrors enabled.
        setDestination('');
        setStep('confirm');
      } else if (err.name === 'InvalidParameterException') {
        setErrorMessage(
          'This account has no verified email address, so a reset code cannot be sent. Please contact support.'
        );
      } else if (err.name === 'LimitExceededException' || err.name === 'TooManyRequestsException') {
        setErrorMessage('Too many attempts. Please wait a few minutes and try again.');
      } else if (err.name === 'NetworkError' || err.message?.includes('fetch')) {
        setErrorMessage('Cannot connect to authentication service. Check your internet connection.');
      } else {
        setErrorMessage(err.message || 'Could not send a reset code. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    setErrorMessage('');
    setInfoMessage('');

    if (!confirmationCode.trim()) {
      setErrorMessage('Please enter the reset code');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setErrorMessage('Please enter and confirm your new password');
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await confirmResetPassword({
        username: email.trim(),
        confirmationCode: confirmationCode.trim(),
        newPassword,
      });

      showAlert(
        'Password Updated',
        'Your password has been reset. You can now sign in with your new password.',
        [{ text: 'Sign In', style: 'default', onPress: onBackToLogin }]
      );
    } catch (error) {
      const err = error as Error & { name?: string };
      console.error('Confirm reset password error:', err?.name, err?.message);

      if (err.name === 'CodeMismatchException') {
        setErrorMessage('That code is not correct. Please check it and try again.');
      } else if (err.name === 'ExpiredCodeException') {
        setErrorMessage('That code has expired. Tap "Resend code" to get a new one.');
      } else if (err.name === 'InvalidPasswordException') {
        setErrorMessage(err.message || 'That password does not meet the requirements.');
      } else if (err.name === 'UserNotFoundException') {
        // Reached only when the email had no account — the neutral path above
        // let the user through to this step. Fail here rather than earlier.
        setErrorMessage('That code is not correct. Please check it and try again.');
      } else if (err.name === 'LimitExceededException' || err.name === 'TooManyRequestsException') {
        setErrorMessage('Too many attempts. Please wait a few minutes and try again.');
      } else if (err.name === 'NetworkError' || err.message?.includes('fetch')) {
        setErrorMessage('Cannot connect to authentication service. Check your internet connection.');
      } else {
        setErrorMessage(err.message || 'Could not reset your password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessages = () => (
    <>
      {errorMessage ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={16} color={colors.error} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {infoMessage ? (
        <View style={styles.infoContainer}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.infoText}>{infoMessage}</Text>
        </View>
      ) : null}
    </>
  );

  const renderRequestStep = () => (
    <>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a code to reset your password.
        </Text>
      </View>

      <View style={styles.formContainer}>
        {renderMessages()}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={[styles.input, focusedField === 'email' && styles.inputFocused]}
            placeholder="Enter your email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={() => handleRequestCode()}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Send Reset Code</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderConfirmStep = () => (
    <>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Enter New Password</Text>
        {destination ? (
          <Text style={styles.subtitle}>
            We sent a reset code to{'\n'}
            <Text style={styles.emailHighlight}>{destination}</Text>
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            If an account exists for that email, we&apos;ve sent it a reset code.
          </Text>
        )}
      </View>

      <View style={styles.formContainer}>
        {renderMessages()}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Reset Code</Text>
          <TextInput
            style={[styles.input, focusedField === 'code' && styles.inputFocused]}
            placeholder="Enter 6-digit code"
            placeholderTextColor={colors.textMuted}
            value={confirmationCode}
            onChangeText={setConfirmationCode}
            onFocus={() => setFocusedField('code')}
            onBlur={() => setFocusedField(null)}
            keyboardType="number-pad"
            autoCapitalize="none"
            maxLength={6}
            editable={!isLoading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>New Password</Text>
          <TextInput
            style={[styles.input, focusedField === 'newPassword' && styles.inputFocused]}
            placeholder="Enter your new password"
            placeholderTextColor={colors.textMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            onFocus={() => setFocusedField('newPassword')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <Text style={styles.helperText}>
            At least {MIN_PASSWORD_LENGTH} characters, with an uppercase letter, a lowercase
            letter, a number and a symbol.
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <TextInput
            style={[styles.input, focusedField === 'confirmPassword' && styles.inputFocused]}
            placeholder="Re-enter your new password"
            placeholderTextColor={colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onFocus={() => setFocusedField('confirmPassword')}
            onBlur={() => setFocusedField(null)}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleConfirmReset}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Reset Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleRequestCode(true)}
          style={styles.resendButton}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Text style={styles.resendButtonText}>Resend code</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.card}>
            {/* Logo Section */}
            <View style={styles.logoContainer}>
              <View style={styles.logoContent}>
                <View style={styles.logoIcon}>
                  <Text style={styles.logoIconText}>SB</Text>
                </View>
                <Text style={styles.logoText}>SideBet</Text>
              </View>
            </View>

            {step === 'request' ? renderRequestStep() : renderConfirmStep()}

            {/* Footer Section */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Remembered your password?</Text>
              <TouchableOpacity
                onPress={onBackToLogin}
                style={styles.linkButton}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.linkButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  logoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 40,
    height: 40,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  logoIconText: {
    color: colors.background,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
  },
  logoText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...textStyles.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailHighlight: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  formContainer: {
    marginBottom: spacing.xl,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '15', // 15 is hex for ~8% opacity
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error,
    marginLeft: spacing.xs,
    flex: 1,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '15',
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  infoText: {
    ...textStyles.bodySmall,
    color: colors.success,
    marginLeft: spacing.xs,
    flex: 1,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    ...commonStyles.textInput,
    backgroundColor: colors.surfaceLight,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  helperText: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: typography.fontSize.xs,
  },
  primaryButton: {
    ...commonStyles.primaryButton,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  primaryButtonText: {
    ...textStyles.button,
    color: colors.background,
    textAlign: 'center',
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  resendButtonText: {
    ...textStyles.bodySmall,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    textDecorationLine: 'underline',
  },
  footerContainer: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    ...textStyles.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  linkButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkButtonText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    textDecorationLine: 'underline',
  },
});
