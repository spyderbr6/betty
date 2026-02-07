/**
 * App Navigator
 * Main navigation structure for the SideBet app
 */

import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors } from '../styles';
import { AppTabParamList, BetsStackParamList, ResolveStackParamList } from '../types/navigation';
import { TabBar } from '../components/ui/TabBar';
import ToastNotificationService from '../services/toastNotificationService';
import { setPushNavigationCallback } from '../services/pushNotificationConfig';
import { getNotificationNavigationAction } from '../utils/notificationNavigationHandler';
import { NotificationType } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';

// Import screens (placeholders for now)
import { BetsScreen } from '../screens/BetsScreen';
import { LiveEventsScreen } from '../screens/LiveEventsScreen';
import { CreateBetScreen } from '../screens/CreateBetScreen';
import { ResolveScreen } from '../screens/ResolveScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SquaresGameDetailScreen } from '../screens/SquaresGameDetailScreen';

// Create navigators
const Tab = createBottomTabNavigator<AppTabParamList>();
const BetsStack = createStackNavigator<BetsStackParamList>();
const ResolveStack = createStackNavigator<ResolveStackParamList>();

// Bets Stack Navigator
const BetsStackNavigator = () => {
  return (
    <BetsStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <BetsStack.Screen
        name="BetsList"
        component={BetsScreen}
        options={{ headerShown: false }} // We'll use custom header
      />
      <BetsStack.Screen
        name="SquaresGameDetail"
        component={SquaresGameDetailScreen}
        options={{ headerShown: false }} // SquaresGameDetailScreen has custom header
      />
    </BetsStack.Navigator>
  );
};

// Resolve Stack Navigator
const ResolveStackNavigator = () => {
  return (
    <ResolveStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <ResolveStack.Screen
        name="ResolutionList"
        component={ResolveScreen}
        options={{ headerShown: false }} // We'll use custom header
      />
      <ResolveStack.Screen
        name="SquaresGameDetail"
        component={SquaresGameDetailScreen}
        options={{ headerShown: false }} // SquaresGameDetailScreen has custom header
      />
    </ResolveStack.Navigator>
  );
};

// Main Tab Navigator
const TabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false, // We'll use custom headers in each screen
      }}
      initialRouteName="Bets"
    >
      <Tab.Screen
        name="Bets"
        component={BetsStackNavigator}
        options={{
          tabBarLabel: 'Active',
        }}
      />
      <Tab.Screen
        name="Resolve"
        component={ResolveStackNavigator}
        options={{
          tabBarLabel: 'Results',
        }}
      />
      <Tab.Screen
        name="Create"
        component={CreateBetScreen}
        options={{
          tabBarLabel: 'Create',
        }}
      />
      <Tab.Screen
        name="Live"
        component={LiveEventsScreen}
        options={{
          tabBarLabel: 'Join',
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarLabel: 'Account',
        }}
      />
    </Tab.Navigator>
  );
};

// Root App Navigator
export const AppNavigator: React.FC = () => {
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const { user, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if onboarding should be shown
  useEffect(() => {
    if (!isLoading && user && !user.onboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [user, isLoading]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  useEffect(() => {
    // Unified navigation handler for both toast and push notifications
    const handleNotificationNavigation = (type: NotificationType, data?: any) => {
      console.log('[Navigation] Handling notification tap:', type, data);

      const navigationAction = getNotificationNavigationAction(type, data);

      if (!navigationRef.current) {
        console.warn('[Navigation] Navigation ref not ready');
        return;
      }

      switch (navigationAction.action) {
        case 'navigate':
          if (navigationAction.screen) {
            navigationRef.current.navigate(navigationAction.screen as never, navigationAction.params as never);
            console.log(`[Navigation] Navigated to ${navigationAction.screen}`);
          }
          break;

        case 'open_modal':
          // For modals, we navigate to the appropriate screen that manages the modal
          // The modal logic is handled by the screens themselves (e.g., AccountScreen opens modals)
          console.log(`[Navigation] Modal navigation: ${navigationAction.modal}`);
          // TODO: Implement modal navigation based on your app's modal architecture
          // For now, navigate to the parent screen
          if (navigationAction.modal === 'notifications') {
            navigationRef.current.navigate('Account' as never);
          } else if (navigationAction.modal === 'friend_requests') {
            navigationRef.current.navigate('Account' as never, { openFriendRequests: true } as never);
          } else if (navigationAction.modal === 'bet_details') {
            navigationRef.current.navigate('Resolve' as never);
          }
          break;

        case 'refresh':
          console.log('[Navigation] Refresh action triggered');
          // The current screen will handle the refresh
          break;

        case 'none':
        default:
          console.log('[Navigation] No navigation action defined');
          break;
      }
    };

    // Register navigation callback for toast notifications
    ToastNotificationService.setNavigationCallback(handleNotificationNavigation);

    // Register navigation callback for push notifications
    setPushNavigationCallback(handleNotificationNavigation);

    return () => {
      // Cleanup on unmount
      ToastNotificationService.setNavigationCallback(() => {});
      setPushNavigationCallback(() => {});
    };
  }, []);

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={{
          dark: true,
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.surface,
            text: colors.textPrimary,
            border: colors.border,
            notification: colors.error,
          },
          fonts: {
            regular: {
              fontFamily: 'System',
              fontWeight: '400',
            },
            medium: {
              fontFamily: 'System',
              fontWeight: '500',
            },
            bold: {
              fontFamily: 'System',
              fontWeight: '600',
            },
            heavy: {
              fontFamily: 'System',
              fontWeight: '700',
            },
          },
        }}
      >
        <TabNavigator />
      </NavigationContainer>

      {/* Onboarding Overlay */}
      <OnboardingScreen visible={showOnboarding} onComplete={handleOnboardingComplete} />
    </>
  );
};