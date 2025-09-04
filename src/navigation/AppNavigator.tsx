/**
 * App Navigator
 * Main navigation structure for the SideBet app
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors } from '../styles';
import { AppTabParamList, BetsStackParamList } from '../types/navigation';
import { TabBar } from '../components/ui/TabBar';

// Import screens (placeholders for now)
import { BetsScreen } from '../screens/BetsScreen';
import { LiveEventsScreen } from '../screens/LiveEventsScreen';
import { CreateBetScreen } from '../screens/CreateBetScreen';
import { ResolveScreen } from '../screens/ResolveScreen';
import { AccountScreen } from '../screens/AccountScreen';

// Create navigators
const Tab = createBottomTabNavigator<AppTabParamList>();
const BetsStack = createStackNavigator<BetsStackParamList>();

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
    </BetsStack.Navigator>
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
          tabBarLabel: 'Bets',
        }}
      />
      <Tab.Screen 
        name="Live" 
        component={LiveEventsScreen}
        options={{
          tabBarLabel: 'Live',
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
        name="Resolve" 
        component={ResolveScreen}
        options={{
          tabBarLabel: 'Resolve',
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
  return (
    <NavigationContainer
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
      }}
    >
      <TabNavigator />
    </NavigationContainer>
  );
};