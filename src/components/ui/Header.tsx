/**
 * Header Component
 * Professional sportsbook header with balance, notifications, and branding
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { UserBalance } from './UserBalance';
import { LiveGameBanner } from './LiveGameBanner';
import { EventDiscoveryModal } from './EventDiscoveryModal';
import { NotificationService } from '../../services/notificationService';
import { useAuth } from '../../contexts/AuthContext';
import { useEventCheckIn } from '../../hooks/useEventCheckIn';
import { NotificationModal } from './NotificationModal';

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
  const { user } = useAuth();
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // Load unread notification count
  useEffect(() => {
    const loadNotificationCount = async () => {
      if (user) {
        try {
          const count = await NotificationService.getUnreadCount(user.userId);
          setUnreadCount(count);
        } catch (error) {
          console.warn('Failed to load notification count:', error);
        }
      }
    };

    loadNotificationCount();

    // Refresh count every 30 seconds for real-time updates
    const interval = setInterval(loadNotificationCount, 30000);

    return () => clearInterval(interval);
  }, [user]);

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
                onPress={onBalancePress}
                variant="header"
                showLabel={true}
              />
            )}

            {rightComponent}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleNotificationPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name="notifications-outline"
                size={18}
                color={colors.textSecondary}
              />
              {(notificationCount ?? unreadCount) > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
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
          if (user) {
            NotificationService.getUnreadCount(user.userId)
              .then(setUnreadCount)
              .catch(console.warn);
          }
        }}
      />

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
