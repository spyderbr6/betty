/**
 * Header Component
 * Professional sportsbook header with balance, notifications, and branding
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { UserBalance } from './UserBalance';
import { LiveGameBanner } from './LiveGameBanner';
import { EventDiscoveryModal } from './EventDiscoveryModal';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useEventCheckIn } from '../../hooks/useEventCheckIn';
import { NotificationModal } from './NotificationModal';
import { WalletScreen } from '../../screens/WalletScreen';

interface HeaderProps {
  title?: string;
  showBalance?: boolean;
  onBalancePress?: () => void;
  onNotificationsPress?: () => void;
  rightComponent?: React.ReactNode;
  variant?: 'default' | 'transparent' | 'minimal';
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBalance = true,
  onBalancePress,
  onNotificationsPress,
  rightComponent,
  variant = 'default',
  notificationCount, // Remove default value, we'll fetch it
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  // Event check-in state (managed globally by hook)
  const {
    checkedInEvent,
    nearbyEventsCount,
    showEventDiscovery,
    setShowEventDiscovery,
    handleCheckInPress,
    handleCheckOut,
    handleCheckInSuccess,
  } = useEventCheckIn();

  // The tab this header sits in, so the Wallet's Activity links come back here rather than
  // to Account. Walks up from the screen's navigator to the tab navigator.
  const [walletReturnTab, setWalletReturnTab] = useState<string | undefined>(undefined);
  const openWallet = () => {
    let nav: any = navigation; // eslint-disable-line @typescript-eslint/no-explicit-any
    let tab: string | undefined;
    while (nav && !tab) {
      const state = nav.getState?.();
      if (state?.type === 'tab') tab = state.routes[state.index]?.name;
      nav = nav.getParent?.();
    }
    setWalletReturnTab(tab);
    setShowWallet(true);
  };

  // Handle notification press
  const handleNotificationPress = () => {
    if (onNotificationsPress) {
      onNotificationsPress();
    } else {
      setShowNotificationModal(true);
    }
  };

  const containerStyle = [
    styles.container,
    { paddingTop: insets.top },
    variant === 'transparent' && styles.transparentContainer,
    variant === 'minimal' && styles.minimalContainer,
  ];

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={variant === 'transparent' ? 'transparent' : colors.surface}
        translucent={variant === 'transparent'}
      />
      <View style={containerStyle}>
        <View style={styles.content}>
          {/* Left Section - Logo */}
          <View style={styles.leftSection}>
            <View style={styles.logoContainer}>
              <View style={styles.logoIcon}>
                <Text style={styles.logoText}>SB</Text>
              </View>
              <Text style={styles.logoTitle}>SideBet</Text>
            </View>
            
            {title && (
              <Text style={styles.title}>{title}</Text>
            )}
          </View>

          {/* Right Section - Balance & Actions */}
          <View style={styles.rightSection}>
            {showBalance && (
              <UserBalance
                // Opens the Wallet from any tab unless the screen supplies its own action
                onPress={onBalancePress ?? openWallet}
                variant="header"
                showLabel={true}
                testID="header-balance"
              />
            )}

            {rightComponent}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleNotificationPress}
              activeOpacity={0.7}
              testID="header-notifications"
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={colors.textSecondary}
              />
              {(notificationCount ?? unreadCount) > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText} testID="header-notifications-count">
                    {(notificationCount ?? unreadCount) > 99 ? '99+' : (notificationCount ?? unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Event Check-In Banner - Always visible */}
        <LiveGameBanner
          checkedInEvent={checkedInEvent}
          nearbyEventsCount={nearbyEventsCount}
          onCheckInPress={handleCheckInPress}
          onCheckOutPress={handleCheckOut}
        />
      </View>

      {/* Notification Modal */}
      <NotificationModal
        visible={showNotificationModal}
        onClose={() => {
          setShowNotificationModal(false);
          // Refresh notification count when modal closes
          refreshUnreadCount();
        }}
        navigation={navigation}
      />

      {/* Wallet, from the balance */}
      <Modal
        visible={showWallet}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowWallet(false)}
      >
        {showWallet && (
          <WalletScreen
            onClose={() => setShowWallet(false)}
            navigation={navigation}
            returnToTab={walletReturnTab}
          />
        )}
      </Modal>

      {/* Event Discovery Modal */}
      <EventDiscoveryModal
        visible={showEventDiscovery}
        onClose={() => setShowEventDiscovery(false)}
        currentUserId={user?.userId || ''}
        onCheckInSuccess={handleCheckInSuccess}
      />
    </>
  );
};


const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.header,
  },
  transparentContainer: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    ...shadows.none,
  },
  minimalContainer: {
    ...shadows.none,
  },
  
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
  },
  
  // Left section
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  logoText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: typography.fontWeight.bold,
  },
  logoTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  
  // Right section
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    // gap is not supported on native; apply margins on children instead
  },
  balanceContainer: {
    alignItems: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 2,
  },
  balanceAmount: {
    ...textStyles.balance,
    color: colors.primary,
    fontSize: typography.fontSize.lg,
  },
  actionButton: {
    padding: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    position: 'relative',
    marginLeft: spacing.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 12,
    includeFontPadding: false,
  },
});
