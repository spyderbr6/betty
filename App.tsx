// Import gesture handler first for React Navigation compatibility
import 'react-native-gesture-handler';
// Import crypto polyfills for Hermes compatibility
import 'react-native-get-random-values';

import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Amplify } from 'aws-amplify';
import '@aws-amplify/react-native';
import amplifyconfig from './amplify_outputs.json';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { Login } from './src/components/Login';
import { SignUp } from './src/components/SignUp';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors } from './src/styles';

// Configure Amplify for React Native
Amplify.configure(amplifyconfig);

type AuthScreen = 'login' | 'signup';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');

  const handleSignUpSuccess = () => {
    setCurrentScreen('login');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Show main app with navigation when user is authenticated
  if (user) {
    return <AppNavigator />;
  }

  // Show authentication screens when user is not authenticated
  if (currentScreen === 'signup') {
    return (
      <SignUp
        onLoginPress={() => setCurrentScreen('login')}
        onSignUpSuccess={handleSignUpSuccess}
      />
    );
  }

  return (
    <Login
      onSignUpPress={() => setCurrentScreen('signup')}
      onLoginSuccess={handleLoginSuccess}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.container}>
        <MainApp />
        <StatusBar style="light" backgroundColor={colors.background} />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});