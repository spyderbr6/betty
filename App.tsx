import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Amplify } from 'aws-amplify';
import amplifyconfig from './amplify_outputs.json';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { Login } from './src/components/Login';
import { SignUp } from './src/components/SignUp';
import { TodoList } from './src/components/TodoList';
import 'react-native-get-random-values';

Amplify.configure(amplifyconfig);

type AuthScreen = 'login' | 'signup';

function MainApp() {
  const { user, isLoading, signOut } = useAuth();
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
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (user) {
    return <TodoList onSignOut={signOut} />;
  }

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
        <StatusBar style="auto" />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});