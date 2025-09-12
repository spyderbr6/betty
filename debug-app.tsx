// Debug version of App.tsx to isolate issues
import 'react-native-gesture-handler';
import 'react-native-get-random-values';

import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Amplify } from 'aws-amplify';
import '@aws-amplify/react-native';
import amplifyconfig from './amplify_outputs.json';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { Login } from './src/components/Login';
import { SignUp } from './src/components/SignUp';

// Configure Amplify
Amplify.configure(amplifyconfig);

type AuthScreen = 'login' | 'signup';

function DebugMainApp() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Welcome! User is logged in.</Text>
        <Text style={styles.text}>User ID: {user.userId}</Text>
        <Text style={styles.text}>Username: {user.username}</Text>
      </View>
    );
  }

  if (currentScreen === 'signup') {
    return (
      <SignUp
        onLoginPress={() => setCurrentScreen('login')}
        onSignUpSuccess={() => setCurrentScreen('login')}
      />
    );
  }

  return (
    <Login
      onSignUpPress={() => setCurrentScreen('signup')}
      onLoginSuccess={() => {}}
    />
  );
}

export default function DebugApp() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <DebugMainApp />
        <StatusBar style="light" />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 10,
  },
});