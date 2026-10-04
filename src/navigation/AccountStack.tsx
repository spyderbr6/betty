/**
 * Account Stack
 *
 * The Account tab's pages. Friends, Wallet, Settings, Help & About and the subscription
 * screen used to be full-screen modals the Account screen opened; as stack pages they get
 * the platform back gesture, mount only when visited, and can be reached directly by a
 * route (a friend-request notification goes straight to Friends).
 *
 * Each page wraps the existing screen component: going back is its onClose, and its
 * header shows a back arrow. Wallet and Subscription are also still opened as modals
 * elsewhere (the header balance on every tab), which is why the screens keep onClose.
 */

import { createStackNavigator, type StackScreenProps } from '@react-navigation/stack';
import type { AccountStackParamList } from '../types/navigation';
import { AccountScreen } from '../screens/AccountScreen';
import { FriendsScreen } from '../screens/FriendsScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';

const Stack = createStackNavigator<AccountStackParamList>();

type PageProps<T extends keyof AccountStackParamList> = StackScreenProps<AccountStackParamList, T>;

const FriendsPage = ({ navigation, route }: PageProps<'Friends'>) => (
  <FriendsScreen
    onClose={() => navigation.goBack()}
    initialShowRequests={route.params?.showRequests}
    headerVariant="back"
  />
);

const WalletPage = ({ navigation, route }: PageProps<'Wallet'>) => (
  <WalletScreen
    onClose={() => navigation.goBack()}
    initialAction={route.params?.initialAction}
    navigation={navigation}
    headerVariant="back"
  />
);

const SettingsPage = ({ navigation }: PageProps<'Settings'>) => (
  <SettingsScreen onClose={() => navigation.goBack()} headerVariant="back" />
);

const HelpPage = ({ navigation }: PageProps<'Help'>) => (
  <HelpScreen onClose={() => navigation.goBack()} headerVariant="back" />
);

const SubscriptionPage = ({ navigation }: PageProps<'Subscription'>) => (
  <SubscriptionScreen onClose={() => navigation.goBack()} headerVariant="back" />
);

export const AccountStackNavigator = () => (
  <Stack.Navigator
    // Every page draws its own header (Header on the home page, ModalHeader elsewhere)
    screenOptions={{ headerShown: false }}
    initialRouteName="AccountHome"
  >
    <Stack.Screen name="AccountHome" component={AccountScreen} />
    <Stack.Screen name="Friends" component={FriendsPage} />
    <Stack.Screen name="Wallet" component={WalletPage} />
    <Stack.Screen name="Settings" component={SettingsPage} />
    <Stack.Screen name="Help" component={HelpPage} />
    <Stack.Screen name="Subscription" component={SubscriptionPage} />
  </Stack.Navigator>
);
