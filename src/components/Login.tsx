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
import { signIn } from 'aws-amplify/auth';
import { useAuth } from '../contexts/AuthContext';

interface LoginProps {
  onSignUpPress: () => void;
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSignUpPress, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { refreshAuth } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
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
      
      // Check for common login errors
      if (err.name === 'UserNotConfirmedException') {
        Alert.alert('Account Not Confirmed', 'Please check your email and confirm your account before signing in.');
      } else if (err.name === 'NotAuthorizedException') {
        Alert.alert('Invalid Credentials', 'Incorrect email or password. Please try again.');
      } else if (err.name === 'UserNotFoundException') {
        Alert.alert('User Not Found', 'No account found with this email address.');
      } else if (err.name === 'NetworkError' || err.message?.includes('fetch')) {
        Alert.alert('Network Error', 'Cannot connect to authentication service. Check your internet connection.');
      } else {
        Alert.alert('Login Failed', `${err.name || 'Unknown'}: ${err.message || 'An error occurred during login'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      
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
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity onPress={onSignUpPress} style={styles.linkButton}>
        <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
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
    marginBottom: 40,
    color: '#333',
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