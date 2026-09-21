/**
 * Custom Tab Bar Component
 * Professional sportsbook-style bottom navigation
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useBetData } from '../../contexts/BetDataContext';

// Initialize GraphQL client
const client = generateClient<Schema>();

export const TabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Badge counts come from BetDataContext, which sits directly above this
  // component in App.tsx and has already loaded every bet, squares game and
  // invitation this bar needs. TabBar used to re-query all of it: three
  // betsByStatus, three squaresGamesByStatus and purchasesByBuyer, up to 1200
  // records on every mount, re-run from its own debounced subscriptions. That
  // was a duplicate of the context's own load, not an independent source.
  //
  // FriendRequest is the one exception. It is not in the context, and it has no
  // GSI on toUserId, so it stays a bounded filtered Scan for a single user.
  const { myBets, betInvitations, squaresInvitations } = useBetData();
  const [friendRequests, setFriendRequests] = useState(0);

  // What is waiting on the viewer. Badges answer "does this tab need me?", so
  // platform inventory - how many bets exist to join - is deliberately not
  // counted: it never reaches zero and so never signals anything.
  const pendingRequests = betInvitations.length + squaresInvitations.length;

  const pendingResolutions = useMemo(
    () =>
      myBets.filter(
        (bet) =>
          bet.creatorId === user?.userId &&
          bet.status === 'PENDING_RESOLUTION' &&
          (bet.participantUserIds || []).length > 0
      ).length,
    [myBets, user?.userId]
  );

  useEffect(() => {
    if (!user?.userId) return;
    const userId = user.userId;

    const fetchFriendRequests = async () => {
      try {
        const result = await client.models.FriendRequest.list({
          filter: { and: [{ toUserId: { eq: userId } }, { status: { eq: 'PENDING' } }] },
        });
        setFriendRequests((result.data || []).length);
      } catch (error) {
        console.error('Error fetching friend request count:', error);
      }
    };

    fetchFriendRequests();

    const subscription = client.models.FriendRequest.onCreate({
      filter: { toUserId: { eq: userId } },
    }).subscribe({
      next: fetchFriendRequests,
      error: (error: unknown) =>
        console.error('Tab friend request subscription error:', error),
    });

    return () => subscription.unsubscribe();
  }, [user?.userId]);

  const getTabIcon = (routeName: string, focused: boolean) => {
    let iconName: keyof typeof Ionicons.glyphMap;

    switch (routeName) {
      case 'Bets':
        iconName = focused ? 'list' : 'list-outline';
        break;
      case 'Live':
        iconName = focused ? 'search' : 'search-outline';
        break;
      case 'Create':
        iconName = focused ? 'add-circle' : 'add-circle-outline';
        break;
      case 'Resolve':
        iconName = focused ? 'hourglass' : 'hourglass-outline';
        break;
      case 'Account':
        iconName = focused ? 'person' : 'person-outline';
        break;
      default:
        iconName = 'help-outline';
    }

    return iconName;
  };

  const getTabLabel = (routeName: string) => {
    switch (routeName) {
      case 'Bets':
        return 'Active';
      case 'Live':
        return 'Join';
      case 'Create':
        return 'Create';
      case 'Resolve':
        return 'Results';
      case 'Account':
        return 'Account';
      default:
        return routeName;
    }
  };

  const getTabCount = (routeName: string): number | null => {
    switch (routeName) {
      // 'Bets' deliberately has no count. It used to show how many open bets
      // the viewer had, which is inventory rather than a request, and it never
      // dropped to zero. It carries a dot instead - see getTabHasPending.
      case 'Live':
        return pendingRequests > 0 ? pendingRequests : null;
      case 'Resolve':
        return pendingResolutions > 0 ? pendingResolutions : null;
      case 'Account':
        return friendRequests > 0 ? friendRequests : null;
      default:
        return null;
    }
  };

  // Invitations are accepted on the Join tab now, so My Bets only hints that
  // something is waiting: a dot, with no number, pointing at another screen.
  const getTabHasPending = (routeName: string): boolean =>
    routeName === 'Bets' && pendingRequests > 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = getTabLabel(route.name);
        const isFocused = state.index === index;
        const iconName = getTabIcon(route.name, isFocused);
        const count = getTabCount(route.name);

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        // Special styling for different tabs
        const isCreateTab = route.name === 'Create';
        const hasBadge = count !== null && count > 0;
        const hasPendingDot = getTabHasPending(route.name);

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            // Derived, not configured. Every screen set tabBarTestID to exactly
            // `tab-<lowercased route name>`, and BottomTabNavigationOptions is a
            // type alias rather than an interface, so the custom option could not
            // be declared and needed an `as any` at every read.
            testID={`tab-${route.name.toLowerCase()}`}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[
              styles.tab,
              isCreateTab && styles.createTab,
              isFocused && styles.tabFocused,
            ]}
            activeOpacity={0.7}
          >
            {/* Active tab indicator line */}
            {isFocused && !isCreateTab && (
              <View style={styles.activeIndicator} />
            )}
            
            <View style={[
              styles.iconContainer,
              isCreateTab && styles.createIconContainer,
              isFocused && isCreateTab && styles.createIconContainerFocused,
              isFocused && !isCreateTab && styles.iconContainerFocused,
            ]}>
              <Ionicons
                name={iconName}
                size={isCreateTab ? 28 : 22}
                color={
                  isFocused
                    ? (isCreateTab ? colors.background : colors.primary)
                    : (isCreateTab ? colors.primary : colors.textMuted)
                }
              />
              
              {/* Count badge on icon */}
              {hasBadge && !isCreateTab && (
                <View style={[
                  styles.badge,
                  route.name === 'Live' && styles.liveBadge,
                  route.name === 'Resolve' && styles.resolveBadge,
                ]}>
                  <Text style={styles.badgeText}>
                    {count > 99 ? '99+' : count.toString()}
                  </Text>
                </View>
              )}

              {/* Pending invitations live on the Join tab; this only points there. */}
              {hasPendingDot && !hasBadge && !isCreateTab && (
                <View style={styles.pendingDot} testID="tab-bets-pending-dot" />
              )}
            </View>
            
            <Text style={[
              styles.label,
              isFocused && styles.labelFocused,
              isCreateTab && styles.createLabel,
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 85,
    ...shadows.header,
  },
  
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs / 2,
    position: 'relative',
  },
  tabFocused: {
    backgroundColor: colors.surfaceLight,
    borderRadius: spacing.radius.sm,
  },
  
  // Active tab indicator
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 1.5,
  },
  
  // Create tab (center) special styling
  createTab: {
    marginTop: -spacing.sm,
  },
  
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs / 2,
    position: 'relative',
  },
  iconContainerFocused: {
    transform: [{ scale: 1.05 }],
  },
  createIconContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  createIconContainerFocused: {
    backgroundColor: colors.primary,
    transform: [{ scale: 1.08 }],
    ...shadows.buttonPressed,
  },
  
  label: {
    ...textStyles.tabLabel,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: typography.fontWeight.medium,
  },
  labelFocused: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  createLabel: {
    marginTop: spacing.xs / 2,
    fontSize: 9,
  },

  // Notification badges
  // A dot, not a count: it signals that something is pending on another tab
  // without implying the number is actionable here.
  pendingDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.background,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  liveBadge: {
    backgroundColor: colors.live,
  },
  resolveBadge: {
    backgroundColor: colors.warning,
  },
  badgeText: {
    color: colors.background,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 11,
  },
});