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
import { signUp, confirmSignUp } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, typography, commonStyles, shadows } from '../styles';
import { PhoneInput } from './ui/PhoneInput';
import { PolicyModal } from './ui/PolicyModal';
import { formatPhoneNumber, validatePhoneNumber } from '../utils/phoneValidation';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } from '../constants/policies';
import type { CountryCode } from 'libphonenumber-js';

const client = generateClient<Schema>();

interface SignUpProps {
  onLoginPress: () => void;
  onSignUpSuccess: () => void;
}

export const SignUp: React.FC<SignUpProps> = ({ onLoginPress, onSignUpSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [formattedPhoneNumber, setFormattedPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'signUp' | 'confirm'>('signUp');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Policy acceptance state
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyModalType, setPolicyModalType] = useState<'terms' | 'privacy'>('terms');

  // Policy modal handlers
  const handleOpenTerms = () => {
    setPolicyModalType('terms');
    setShowPolicyModal(true);
  };

  const handleOpenPrivacy = () => {
    setPolicyModalType('privacy');
    setShowPolicyModal(true);
  };

  const handleClosePolicyModal = () => {
    setShowPolicyModal(false);
  };

  const handleSignUp = async () => {
    // Clear previous errors
    setErrorMessage('');

    // Validate all fields
    if (!email.trim() || !password.trim() || !displayName.trim() || !phoneNumber.trim()) {
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

    // Validate phone number
    if (!validatePhoneNumber(phoneNumber, countryCode)) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    // Validate policy acceptance
    if (!tosAccepted || !privacyAccepted) {
      setErrorMessage('You must accept the Terms of Service and Privacy Policy to create an account');
      return;
    }

    // Format phone number to E.164
    const formatted = formatPhoneNumber(phoneNumber, countryCode);
    if (!formatted) {
      setErrorMessage('Failed to format phone number');
      return;
    }

    setFormattedPhoneNumber(formatted);

    // Create Cognito account with phone number (unverified initially)
    // Phone verification will happen after login
    setIsLoading(true);
    try {
      await signUp({
        username: email.trim(),
        password: password,
        options: {
          userAttributes: {
            email: email.trim(),
            preferred_username: email.trim(),
            name: displayName.trim(),
            phone_number: formatted, // Add phone number (will be unverified)
          },
        },
      });
      setStep('confirm');
      setErrorMessage('');
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

      // Note: User record with policy acceptance is created on first login in AccountScreen
      // The SignUp component validates policy acceptance before allowing signup,
      // ensuring all new users have accepted current policies.

      setErrorMessage(''); // Clear any errors on success
      onSignUpSuccess();
    } catch (error) {
      const err = error as Error;
      console.error('Confirmation error:', error);
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

              {/* Phone Number Input */}
              <PhoneInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                onChangeFormattedText={setFormattedPhoneNumber}
                onChangeCountryCode={setCountryCode}
                label="Phone Number"
                placeholder="Enter your phone number"
                required
                disabled={isLoading}
                defaultCountryCode={countryCode}
              />

              {/* Helper Text */}
              <Text style={styles.helperText}>
                Phone number is required for account security and friend discovery
              </Text>

              {/* Policy Acceptance Checkboxes */}
              <View style={styles.policyContainer}>
                {/* Terms of Service Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setTosAccepted(!tosAccepted)}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, tosAccepted && styles.checkboxChecked]}>
                    {tosAccepted && (
                      <Ionicons name="checkmark" size={16} color={colors.background} />
                    )}
                  </View>
                  <Text style={styles.policyText}>
                    I agree to the{' '}
                    <Text
                      style={styles.policyLink}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenTerms();
                      }}
                    >
                      Terms of Service
                    </Text>
                  </Text>
                </TouchableOpacity>

                {/* Privacy Policy Checkbox */}
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setPrivacyAccepted(!privacyAccepted)}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                    {privacyAccepted && (
                      <Ionicons name="checkmark" size={16} color={colors.background} />
                    )}
                  </View>
                  <Text style={styles.policyText}>
                    I agree to the{' '}
                    <Text
                      style={styles.policyLink}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenPrivacy();
                      }}
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>

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

  return (
    <>
      {step === 'confirm' ? renderConfirmationStep() : renderSignUpStep()}

      {/* Policy Modal */}
      <PolicyModal
        visible={showPolicyModal}
        onClose={handleClosePolicyModal}
        policyType={policyModalType}
      />
    </>
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
  policyContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: spacing.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 2, // Align with text baseline
    backgroundColor: colors.surfaceLight,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  policyText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  policyLink: {
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    textDecorationLine: 'underline',
  },
});