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

interface SignUpProps {
  onLoginPress: () => void;
  onSignUpSuccess: () => void;
}

export const SignUp: React.FC<SignUpProps> = ({ onLoginPress, onSignUpSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'signUp' | 'confirm'>('signUp');

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
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
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 10,
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
});