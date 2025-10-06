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
import { signIn } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, textStyles, typography, commonStyles, shadows } from '../styles';

interface LoginProps {
  onSignUpPress: () => void;
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSignUpPress, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { refreshAuth } = useAuth();

  const handleLogin = async () => {
    // Clear previous errors
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Attempting login for user:', email.trim());
      const result = await signIn({
        username: email.trim(),
        password: password,
      });
      console.log('Login successful:', result);
      // Refresh auth state after successful login
      await refreshAuth();
      onLoginSuccess();
    } catch (error) {
      const err = error as Error & { name?: string; code?: string; cause?: string; message?: string };
      console.error('Login error:', error);
      console.error('Error name:', err?.name);
      console.error('Error message:', err?.message);
      console.error('Error code:', err?.code);
      console.error('Error cause:', err?.cause);
      console.error('Error stack:', err?.stack);

      // Check for common login errors and set inline error message
      if (err.name === 'UserNotConfirmedException') {
        setErrorMessage('Please check your email and confirm your account before signing in.');
      } else if (err.name === 'NotAuthorizedException') {
        setErrorMessage('Incorrect email or password. Please try again.');
      } else if (err.name === 'UserNotFoundException') {
        setErrorMessage('No account found with this email address.');
      } else if (err.name === 'NetworkError' || err.message?.includes('fetch')) {
        setErrorMessage('Cannot connect to authentication service. Check your internet connection.');
      } else {
        setErrorMessage(err.message || 'An error occurred during login');
      }
    } finally {
      setIsLoading(false);
    }
  };

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
            
            {/* Header Section */}
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>
                Sign in to your SideBet account
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
                  placeholder="Enter your password"
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

              {/* Sign In Button */}
              <TouchableOpacity
                style={[
                  styles.signInButton,
                  isLoading && styles.buttonDisabled
                ]}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.signInButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer Section */}
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>
                Don't have an account?
              </Text>
              <TouchableOpacity 
                onPress={onSignUpPress} 
                style={styles.linkButton}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.linkButtonText}>Create Account</Text>
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
  signInButton: {
    ...commonStyles.primaryButton,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  signInButtonText: {
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