import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { signUp, confirmSignUp } from 'aws-amplify/auth';
import { colors, spacing, textStyles, typography, commonStyles, shadows } from '../styles';

interface SignUpProps {
  onLoginPress: () => void;
  onSignUpSuccess: () => void;
}

export const SignUp: React.FC<SignUpProps> = ({ onLoginPress, onSignUpSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'signUp' | 'confirm'>('signUp');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSignUp = async () => {
    // Clear previous errors
    setErrorMessage('');

    if (!email.trim() || !password.trim() || !displayName.trim()) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (displayName.trim().length < 2) {
      setErrorMessage('Display name must be at least 2 characters long');
      return;
    }

    if (displayName.trim().length > 30) {
      setErrorMessage('Display name must be less than 30 characters');
      return;
    }

    setIsLoading(true);
    try {
      await signUp({
        username: email.trim(),
        password: password,
        options: {
          userAttributes: {
            email: email.trim(),
            preferred_username: email.trim(),
            name: displayName.trim(), // Store display name in Cognito
          },
        },
      });
      setStep('confirm');
      setErrorMessage(''); // Clear any errors on success
    } catch (error) {
      const err = error as Error;
      setErrorMessage(err.message || 'An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async () => {
    // Clear previous errors
    setErrorMessage('');

    if (!confirmationCode.trim()) {
      setErrorMessage('Please enter the confirmation code');
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: confirmationCode.trim(),
      });
      setErrorMessage(''); // Clear any errors on success
      onSignUpSuccess();
    } catch (error) {
      const err = error as Error;
      setErrorMessage(err.message || 'An error occurred during confirmation');
    } finally {
      setIsLoading(false);
    }
  };

  const renderConfirmationStep = () => (
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
            
            {/* Header Section */}
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Confirm Your Email</Text>
              <Text style={styles.subtitle}>
                We sent a confirmation code to{'\n'}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Confirmation Code Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirmation Code</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'confirmationCode' && styles.inputFocused,
                  ]}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.textMuted}
                  value={confirmationCode}
                  onChangeText={setConfirmationCode}
                  onFocus={() => setFocusedField('confirmationCode')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  maxLength={6}
                  editable={!isLoading}
                />
              </View>

              {/* Confirm Button */}
              <TouchableOpacity
                style={[
                  styles.signUpButton,
                  isLoading && styles.buttonDisabled
                ]}
                onPress={handleConfirmSignUp}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.signUpButtonText}>Confirm Account</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer Section */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                Already have an account?
              </Text>
              <TouchableOpacity 
                onPress={onLoginPress} 
                style={styles.linkButton}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.linkButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderSignUpStep = () => (
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
            
            {/* Header Section */}
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>
                Join SideBet and start betting with friends
              </Text>
            </View>

            {/* Form Section */}
            <View style={styles.formContainer}>
              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Display Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Display Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'displayName' && styles.inputFocused,
                  ]}
                  placeholder="How you'll appear to friends"
                  placeholderTextColor={colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  onFocus={() => setFocusedField('displayName')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={30}
                  editable={!isLoading}
                />
              </View>

              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'email' && styles.inputFocused,
                  ]}
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

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'password' && styles.inputFocused,
                  ]}
                  placeholder="Create a secure password"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>

              {/* Helper Text */}
              <Text style={styles.helperText}>
                Your display name is how you'll appear to friends
              </Text>

              {/* Sign Up Button */}
              <TouchableOpacity
                style={[
                  styles.signUpButton,
                  isLoading && styles.buttonDisabled
                ]}
                onPress={handleSignUp}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.signUpButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer Section */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                Already have an account?
              </Text>
              <TouchableOpacity 
                onPress={onLoginPress} 
                style={styles.linkButton}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.linkButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return step === 'confirm' ? renderConfirmationStep() : renderSignUpStep();
};

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
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
    textAlign: 'center',
    marginBottom: spacing.md,
    fontSize: typography.fontSize.xs,
  },
  signUpButton: {
    ...commonStyles.primaryButton,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  signUpButtonText: {
    ...textStyles.button,
    color: colors.background,
    textAlign: 'center',
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