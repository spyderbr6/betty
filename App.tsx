// Import gesture handler first for React Navigation compatibility
import 'react-native-gesture-handler';
// Import crypto polyfills for Hermes compatibility
import 'react-native-get-random-values';
// Import Intl polyfills for Hermes compatibility
import 'intl';
import 'intl/locale-data/jsonp/en-US';
// Import TextEncoder/TextDecoder polyfill for QR code generation
import 'text-encoding';

// Configure Amplify BEFORE importing any components that use it
import { Amplify } from 'aws-amplify';
import '@aws-amplify/react-native';
import amplifyconfig from './amplify_outputs.json';
Amplify.configure(amplifyconfig);

// Now import components that use Amplify
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { EventCheckInProvider } from './src/contexts/EventCheckInContext';
import { Login } from './src/components/Login';
import { SignUp } from './src/components/SignUp';
import { AppNavigator } from './src/navigation/AppNavigator';
import { colors } from './src/styles';
import Toast from 'react-native-toast-message';
import { toastConfig } from './src/components/ui/ToastConfig';
import { CustomAlertController } from './src/components/ui/CustomAlert';

type AuthScreen = 'login' | 'signup';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<AuthScreen>('login');

  const handleLoginSuccess = () => {
    // Auth context will automatically update user state
  };

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
    <SafeAreaProvider>
      <AuthProvider>
        <EventCheckInProvider>
          <View style={styles.container}>
            <MainApp />
            <StatusBar style="light" backgroundColor={colors.background} />
            <Toast config={toastConfig} />
            <CustomAlertController />
          </View>
        </EventCheckInProvider>
      </AuthProvider>
    </SafeAreaProvider>
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