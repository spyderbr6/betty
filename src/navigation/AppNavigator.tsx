/**
 * App Navigator
 * Main navigation structure for the SideBet app
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CommonActions, NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors } from '../styles';
import { AppTabParamList, BetsStackParamList, ResolveStackParamList } from '../types/navigation';
import { TabBar } from '../components/ui/TabBar';
import ToastNotificationService from '../services/toastNotificationService';
import { setPushNavigationCallback } from '../services/pushNotificationConfig';
import { getNotificationNavigationAction } from '../utils/notificationNavigationHandler';
import { notificationRoute } from '../services/notificationRoutes';
import { NotificationType } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';

// Import screens (placeholders for now)
import { BetsScreen } from '../screens/BetsScreen';
import { LiveEventsScreen } from '../screens/LiveEventsScreen';
import { CreateBetScreen } from '../screens/CreateBetScreen';
import { ResolveScreen } from '../screens/ResolveScreen';
import { AccountStackNavigator } from './AccountStack';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { SquaresGameDetailScreen } from '../screens/SquaresGameDetailScreen';
import { BetDetailsScreen } from '../screens/BetDetailsScreen';

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
        name="BetDetails"
        component={BetDetailsScreen}
        options={{ headerShown: false }}
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
        component={AccountStackNavigator}
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

  // Unified navigation handler for both toast and push notifications
  const handleNotificationNavigation = useCallback((type: NotificationType, data?: any) => {
    console.log('[Navigation] Handling notification tap:', type, data);

    const navigationAction = getNotificationNavigationAction(type, data);

    if (!navigationRef.current) {
      console.warn('[Navigation] Navigation ref not ready');
      return;
    }

    // Shared with the in-app feed (NotificationScreen), so a tap lands in the same place
    // wherever it comes from. The root navigator only knows tabs: the route names the tab
    // and the page inside it.
    const route = notificationRoute(navigationAction, 'push');
    if (!route) {
      console.log('[Navigation] No navigation for this notification');
      return;
    }
    navigationRef.current.dispatch(CommonActions.navigate({ name: route.tab, params: route.params }));
    console.log('[Navigation] Navigated to', route.tab, route.params?.screen ?? '');
  }, []);

  useEffect(() => {
    // Register navigation callback for toast notifications
    ToastNotificationService.setNavigationCallback(handleNotificationNavigation);

    return () => {
      // Cleanup on unmount. Push taps are held until a navigator registers again.
      ToastNotificationService.setNavigationCallback(() => {});
      setPushNavigationCallback(null);
    };
  }, [handleNotificationNavigation]);

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        // Push taps are routed only once the navigator can navigate; a tap that launched
        // the app has been held until now (notificationTap.ts).
        onReady={() => setPushNavigationCallback(handleNotificationNavigation)}
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