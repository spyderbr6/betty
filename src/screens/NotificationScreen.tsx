/**
 * Notification Screen
 * Dedicated screen for viewing and managing user notifications
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
// Remove unused client import - we use NotificationService instead
// import { generateClient } from 'aws-amplify/data';
// import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, commonStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { showAlert } from '../components/ui/CustomAlert';
import { useAuth } from '../contexts/AuthContext';
import { NotificationService } from '../services/notificationService';
import { Notification, NotificationType } from '../types/betting';
import { getNotificationNavigationAction } from '../utils/notificationNavigationHandler';

// Client not needed - using NotificationService instead

interface NotificationItemProps {
  notification: Notification;
  onPress: (notification: Notification) => void;
  onMarkAsRead: (notificationId: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onPress,
  onMarkAsRead,
}) => {
  const getNotificationIcon = (type: NotificationType): string => {
    switch (type) {
      case 'BET_JOINED':
        return 'people';
      case 'BET_RESOLVED':
        return 'checkmark-circle';
      case 'BET_CANCELLED':
        return 'close-circle';
      case 'FRIEND_REQUEST_RECEIVED':
        return 'person-add';
      case 'FRIEND_REQUEST_ACCEPTED':
        return 'heart';
      case 'FRIEND_REQUEST_DECLINED':
        return 'person-remove';
      case 'BET_INVITATION_RECEIVED':
        return 'mail';
      case 'BET_INVITATION_ACCEPTED':
        return 'checkmark';
      case 'BET_INVITATION_DECLINED':
        return 'close';
      case 'BET_DEADLINE_APPROACHING':
        return 'time';
      case 'SYSTEM_ANNOUNCEMENT':
        return 'megaphone';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (type: NotificationType): string => {
    switch (type) {
      case 'BET_RESOLVED':
        return colors.success;
      case 'BET_CANCELLED':
      case 'FRIEND_REQUEST_DECLINED':
      case 'BET_INVITATION_DECLINED':
        return colors.error;
      case 'BET_JOINED':
      case 'FRIEND_REQUEST_ACCEPTED':
      case 'BET_INVITATION_ACCEPTED':
        return colors.primary;
      case 'BET_DEADLINE_APPROACHING':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const formatTimeAgo = (createdAt: string): string => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffInMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return created.toLocaleDateString();
  };

  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !notification.isRead && styles.unreadNotification
      ]}
      onPress={() => onPress(notification)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={getNotificationIcon(notification.type) as any}
              size={20}
              color={getNotificationColor(notification.type)}
            />
          </View>
          <View style={styles.notificationText}>
            <Text style={[
              styles.notificationTitle,
              !notification.isRead && styles.unreadTitle
            ]}>
              {notification.title}
            </Text>
            <Text style={[
              textStyles.bodySmall,
              styles.notificationMessage,
              !notification.isRead && styles.unreadMessage
            ]}>
              {notification.message}
            </Text>
          </View>
          <View style={styles.notificationMeta}>
            <Text style={styles.timestampText}>
              {formatTimeAgo(notification.createdAt)}
            </Text>
            {!notification.isRead && (
              <TouchableOpacity
                style={styles.markReadButton}
                onPress={(e) => {
                  e.stopPropagation();
                  onMarkAsRead(notification.id);
                }}
              >
                <Ionicons name="checkmark" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        {!notification.isRead && <View style={styles.unreadIndicator} />}
      </View>
    </TouchableOpacity>
  );
};

interface NotificationScreenProps {
  onClose?: () => void;
  navigation?: any; // Navigation prop for deep linking to screens
}

const NOTIFICATIONS_PER_PAGE = 20;

export const NotificationScreen: React.FC<NotificationScreenProps> = ({ onClose, navigation }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async (loadMore: boolean = false) => {
    if (!user) return;

    try {
      if (loadMore && !hasMore) return;

      const currentLimit = loadMore
        ? notifications.length + NOTIFICATIONS_PER_PAGE
        : NOTIFICATIONS_PER_PAGE;

      const userNotifications = await NotificationService.getUserNotifications(user.userId, {
        limit: currentLimit,
        unreadOnly: true // Fetch only unread notifications from database
      });

      // No need to filter - already filtered by database query
      const unreadNotifications = userNotifications;

      setNotifications(unreadNotifications);
      setUnreadCount(unreadNotifications.length);

      // If we got fewer notifications than requested, there are no more
      setHasMore(userNotifications.length >= currentLimit);
    } catch (error) {
      console.error('Error loading notifications:', error);
      showAlert('Error', 'Failed to load notifications. Please try again.');
    }
  }, [user, notifications.length, hasMore]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setHasMore(true);
    await loadNotifications(false);
    setIsRefreshing(false);
  }, [loadNotifications]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    await loadNotifications(true);
    setIsLoadingMore(false);
  }, [loadNotifications, isLoadingMore, hasMore]);

  const handleNotificationPress = useCallback((notification: Notification) => {
    // Mark as read if unread
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }

    // Get navigation action from utility
    const navigationAction = getNotificationNavigationAction(notification.type, {
      notificationId: notification.id,
      actionType: notification.actionType,
      actionData: notification.actionData,
      relatedBetId: notification.relatedBetId,
      relatedUserId: notification.relatedUserId,
    });

    // Only navigate if navigation prop is provided
    if (!navigation) {
      console.log('[NotificationScreen] Navigation prop not provided, cannot navigate');
      return;
    }

    // Handle navigation based on action type (navigate BEFORE closing modal)
    if (navigationAction.action === 'navigate') {
      const { screen, params } = navigationAction;

      // Map screen names to navigation calls
      switch (screen) {
        case 'SquaresGameDetail':
          // Navigate to Bets tab, then to SquaresGameDetail
          navigation.navigate('Bets', {
            screen: 'SquaresGameDetail',
            params: { gameId: params?.gameId }
          });
          break;

        case 'MyBets':
          // Navigate to Bets tab
          navigation.navigate('Bets');
          break;

        case 'Friends':
          // Navigate to Account tab (Friends screen is a modal from Account)
          navigation.navigate('Account');
          break;

        case 'Account':
          // Navigate to Account tab
          navigation.navigate('Account');
          break;

        default:
          console.log('[NotificationScreen] Unknown screen:', screen);
      }
    } else if (navigationAction.action === 'open_modal') {
      // For modal actions like bet_details, navigate to Bets tab with params
      const { modal, params } = navigationAction;

      if (modal === 'bet_details' && params?.betId) {
        navigation.navigate('Bets', {
          screen: 'BetDetails',
          params: { betId: params.betId }
        });
      } else if (modal === 'bet_invitation' && params?.betId) {
        // Navigate to bet details (user can see invitation there)
        navigation.navigate('Bets', {
          screen: 'BetDetails',
          params: { betId: params.betId }
        });
      } else {
        console.log('[NotificationScreen] Unknown modal:', modal);
      }
    }

    // Close modal after navigation starts (with small delay to ensure navigation completes)
    if (onClose) {
      setTimeout(() => onClose(), 100);
    }
  }, [navigation, onClose]);

  const handleMarkAsRead = useCallback(async (notificationId: string) => {
    try {
      const success = await NotificationService.markAsRead(notificationId);
      if (success) {
        setNotifications(prev =>
          prev.map(notification =>
            notification.id === notificationId
              ? { ...notification, isRead: true }
              : notification
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  const handleMarkAllAsRead = useCallback(async () => {
    if (!user || unreadCount === 0) return;

    try {
      const success = await NotificationService.markAllAsRead(user.userId);
      if (success) {
        setNotifications(prev =>
          prev.map(notification => ({ ...notification, isRead: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      showAlert('Error', 'Failed to mark all notifications as read.');
    }
  }, [user, unreadCount]);

  useEffect(() => {
    loadNotifications().finally(() => setIsLoading(false));
  }, [loadNotifications]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Notifications" onClose={onClose || (() => {})} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[textStyles.body, styles.loadingText]}>
            Loading notifications...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Notifications" onClose={onClose || (() => {})} />

      {unreadCount > 0 && (
        <View style={styles.markAllContainer}>
          <Text style={styles.unreadCountText}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllAsRead}
          >
            <Text style={styles.markAllButtonText}>Mark All Read</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={handleNotificationPress}
            onMarkAsRead={handleMarkAsRead}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="notifications-outline"
              size={64}
              color={colors.textSecondary}
            />
            <Text style={[textStyles.h4, styles.emptyTitle]}>
              No notifications yet
            </Text>
            <Text style={[textStyles.body, styles.emptyMessage]}>
              You'll see notifications here when you have betting activity or friend interactions.
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingMoreText}>Loading more...</Text>
            </View>
          ) : null
        }
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.flatListContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  markAllContainer: {
    ...commonStyles.flexBetween,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadCountText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary, // #D1D5DB - 7.5:1 contrast
    fontSize: 14,
  },
  markAllButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
  },
  markAllButtonText: {
    ...textStyles.label,
    color: colors.textInverse,
  },
  flatListContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  loadingMoreText: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  notificationItem: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  unreadNotification: {
    backgroundColor: colors.surfaceLight,
  },
  notificationContent: {
    position: 'relative',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  notificationText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  notificationTitle: {
    ...textStyles.label,
    color: colors.textSecondary, // #D1D5DB - 7.5:1 contrast on surface
    fontSize: 14,
    fontWeight: typography.fontWeight.medium,
  },
  unreadTitle: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary, // #FFFFFF - Maximum contrast for unread
  },
  notificationMessage: {
    marginTop: spacing.xs / 2,
    color: colors.textSecondary, // #D1D5DB - 7.5:1 contrast ratio on surface
    lineHeight: 20, // Increased for better readability
  },
  unreadMessage: {
    color: colors.textPrimary, // #FFFFFF - Maximum contrast
    fontWeight: typography.fontWeight.medium, // Added weight for emphasis
  },
  notificationMeta: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  timestampText: {
    ...textStyles.caption,
    color: colors.textSecondary, // #D1D5DB - Better contrast than textMuted
    fontSize: 12,
  },
  markReadButton: {
    marginTop: spacing.xs,
    padding: spacing.xs,
  },
  unreadIndicator: {
    position: 'absolute',
    right: 0,
    top: spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2,
  },
  emptyTitle: {
    marginTop: spacing.lg,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyMessage: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default NotificationScreen;