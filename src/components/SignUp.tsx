import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { signUp, confirmSignUp } from 'aws-amplify/auth';
import { colors, spacing, textStyles, typography } from '../styles';

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

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim() || !displayName.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (displayName.trim().length < 2) {
      Alert.alert('Error', 'Display name must be at least 2 characters long');
      return;
    }

    if (displayName.trim().length > 30) {
      Alert.alert('Error', 'Display name must be less than 30 characters');
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
      Alert.alert('Success', 'Please check your email for a confirmation code');
    } catch (error) {
      const err = error as Error;
      Alert.alert('Sign Up Failed', err.message || 'An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async () => {
    if (!confirmationCode.trim()) {
      Alert.alert('Error', 'Please enter the confirmation code');
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: confirmationCode.trim(),
      });
      Alert.alert('Success', 'Account confirmed! You can now sign in.');
      onSignUpSuccess();
    } catch (error) {
      const err = error as Error;
      Alert.alert('Confirmation Failed', err.message || 'An error occurred during confirmation');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'confirm') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirm Your Email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation code to {email}
        </Text>
        
        <TextInput
          style={styles.input}
          placeholder="Confirmation Code"
          value={confirmationCode}
          onChangeText={setConfirmationCode}
          keyboardType="number-pad"
          autoCapitalize="none"
        />
        
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleConfirmSignUp}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Confirm</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity onPress={onLoginPress} style={styles.linkButton}>
          <Text style={styles.linkText}>Already have an account? Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>
        Join SideBet and start betting with friends
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Display Name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={30}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      <Text style={styles.helperText}>
        Your display name is how you'll appear to friends
      </Text>
      
      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity onPress={onLoginPress} style={styles.linkButton}>
        <Text style={styles.linkText}>Already have an account? Sign In</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...textStyles.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.bold,
  },
  subtitle: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  },
  helperText: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontSize: 12,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  linkText: {
    ...textStyles.body,
    color: colors.primary,
    fontSize: typography.fontSize.base,
  },
});