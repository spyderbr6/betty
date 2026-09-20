/**
 * Custom Tab Bar Component
 * Professional sportsbook-style bottom navigation
 */

import React, { useState, useEffect } from 'react';
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

// Initialize GraphQL client
const client = generateClient<Schema>();

export const TabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tabCounts, setTabCounts] = useState({
    myBets: 0,
    joinableBets: 0,
    pendingResolutions: 0,
    friendRequests: 0,
  });

  // Badge counts.
  //
  // This used to Scan every bet and squares game on the platform, then issue one
  // more Scan per bet to find its participants — an N+1 whose cost grew with
  // total bets rather than with this user's bets. It then re-ran the whole
  // cascade from five *unfiltered* observeQuery subscriptions, so any write by
  // any user anywhere re-scanned the tables on every connected client.
  //
  // Now: indexed status queries, participation read from the denormalized
  // Bet.participantUserIds (which exists precisely to avoid the participant
  // lookup), and subscriptions filtered to this user.
  useEffect(() => {
    if (!user?.userId) return;
    const userId = user.userId;

    const fetchTabCounts = async () => {
      try {
        const [
          activeBets,
          liveBets,
          pendingBets,
          activeGames,
          lockedGames,
          liveGames,
          { data: userPurchases },
          { data: pendingFriendRequests },
        ] = await Promise.all([
          client.models.Bet.betsByStatus({ status: 'ACTIVE' as any }, { limit: 200 }),
          client.models.Bet.betsByStatus({ status: 'LIVE' as any }, { limit: 200 }),
          client.models.Bet.betsByStatus({ status: 'PENDING_RESOLUTION' as any }, { limit: 200 }),
          client.models.SquaresGame.squaresGamesByStatus({ status: 'ACTIVE' as any }, { limit: 200 }),
          client.models.SquaresGame.squaresGamesByStatus({ status: 'LOCKED' as any }, { limit: 200 }),
          client.models.SquaresGame.squaresGamesByStatus({ status: 'LIVE' as any }, { limit: 200 }),
          client.models.SquaresPurchase.purchasesByBuyer({ userId }),
          // FriendRequest has no GSI on toUserId yet, so this one is still a
          // filtered Scan. It is bounded by pending requests for one user.
          client.models.FriendRequest.list({
            filter: { and: [{ toUserId: { eq: userId } }, { status: { eq: 'PENDING' } }] },
          }),
        ]);

        const allBets = [
          ...(activeBets.data || []),
          ...(liveBets.data || []),
          ...(pendingBets.data || []),
        ];
        const allSquaresGames = [
          ...(activeGames.data || []),
          ...(lockedGames.data || []),
          ...(liveGames.data || []),
        ];

        // Denormalised on the Bet record — no per-bet participant query.
        const joined = (bet: any) => (bet.participantUserIds || []).includes(userId);
        const created = (bet: any) => bet.creatorId === userId;
        const hasParticipants = (bet: any) => (bet.participantUserIds || []).length > 0;

        const myBetsCount = allBets.filter(
          (bet) => (created(bet) || joined(bet)) && (bet.status === 'ACTIVE' || bet.status === 'LIVE')
        ).length;

        const purchasedGameIds = new Set(
          (userPurchases || []).map((purchase: any) => purchase.squaresGameId).filter(Boolean)
        );
        const mySquaresCount = allSquaresGames.filter(
          (game: any) => game.creatorId === userId || purchasedGameIds.has(game.id)
        ).length;

        const joinableBetsCount = allBets.filter(
          (bet) => !created(bet) && !joined(bet) && bet.status === 'ACTIVE'
        ).length;

        const pendingResolutionsCount = allBets.filter(
          (bet) => created(bet) && hasParticipants(bet) && bet.status === 'PENDING_RESOLUTION'
        ).length;

        setTabCounts({
          myBets: myBetsCount + mySquaresCount,
          joinableBets: joinableBetsCount,
          pendingResolutions: pendingResolutionsCount,
          friendRequests: pendingFriendRequests?.length || 0,
        });
      } catch (error) {
        console.error('Error fetching tab counts:', error);
      }
    };

    fetchTabCounts();

    // Coalesce bursts: a single join writes a Participant, updates the Bet and
    // may settle a squares purchase, which would otherwise be three refetches.
    let pending: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        fetchTabCounts();
      }, 500);
    };
    const onError = (label: string) => (error: unknown) =>
      console.error(`Tab ${label} subscription error:`, error);

    // Filtered to this user. The joinable count can lag a stranger's new bet
    // until the next mount or refresh, which is acceptable for a badge and is
    // the trade the architecture assessment recommends (F7).
    const subscriptions = [
      client.models.Bet.onCreate({ filter: { creatorId: { eq: userId } } }).subscribe({
        next: refresh,
        error: onError('bet create'),
      }),
      client.models.Bet.onUpdate({ filter: { creatorId: { eq: userId } } }).subscribe({
        next: refresh,
        error: onError('bet update'),
      }),
      client.models.Participant.onCreate({ filter: { userId: { eq: userId } } }).subscribe({
        next: refresh,
        error: onError('participant'),
      }),
      client.models.SquaresPurchase.onCreate({ filter: { userId: { eq: userId } } }).subscribe({
        next: refresh,
        error: onError('squares purchase'),
      }),
      client.models.FriendRequest.onCreate({ filter: { toUserId: { eq: userId } } }).subscribe({
        next: refresh,
        error: onError('friend request'),
      }),
    ];

    return () => {
      if (pending) clearTimeout(pending);
      subscriptions.forEach((s) => s.unsubscribe());
    };
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
      case 'Bets':
        return tabCounts.myBets > 0 ? tabCounts.myBets : null;
      case 'Live':
        return tabCounts.joinableBets > 0 ? tabCounts.joinableBets : null;
      case 'Resolve':
        return tabCounts.pendingResolutions > 0 ? tabCounts.pendingResolutions : null;
      case 'Account':
        return tabCounts.friendRequests > 0 ? tabCounts.friendRequests : null;
      default:
        return null;
    }
  };

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

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={(options as any).tabBarTestID}
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