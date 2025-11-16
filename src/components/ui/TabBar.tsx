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
    notifications: 0,
  });

  // Fetch real counts for badges
  useEffect(() => {
    const fetchTabCounts = async () => {
      if (!user?.userId) return;

      try {
        // Fetch user's active bets (My Bets count)
        const { data: allBets } = await client.models.Bet.list({
          filter: {
            or: [
              { status: { eq: 'ACTIVE' } },
              { status: { eq: 'LIVE' } },
              { status: { eq: 'PENDING_RESOLUTION' } }
            ]
          }
        });

        if (allBets) {
          // Get participants for filtering
          const betsWithParticipants = await Promise.all(
            allBets.map(async (bet) => {
              const { data: participants } = await client.models.Participant.list({
                filter: { betId: { eq: bet.id! } }
              });
              return { bet, participants: participants || [] };
            })
          );

          // Count user's bets (creator or participant)
          const myBetsCount = betsWithParticipants.filter(({ bet, participants }) => {
            const isCreator = bet.creatorId === user.userId;
            const isParticipant = participants.some(p => p.userId === user.userId);
            return isCreator || isParticipant;
          }).length;

          // Count joinable bets (not creator, not participant)
          const joinableBetsCount = betsWithParticipants.filter(({ bet, participants }) => {
            const isCreator = bet.creatorId === user.userId;
            const isParticipant = participants.some(p => p.userId === user.userId);
            return !isCreator && !isParticipant && bet.status === 'ACTIVE';
          }).length;

          // Count pending resolutions (user is creator)
          const pendingResolutionsCount = betsWithParticipants.filter(({ bet, participants }) => {
            const isCreator = bet.creatorId === user.userId;
            const hasParticipants = participants.length > 0;
            return isCreator && hasParticipants && bet.status === 'PENDING_RESOLUTION';
          }).length;

          setTabCounts({
            myBets: myBetsCount,
            joinableBets: joinableBetsCount,
            pendingResolutions: pendingResolutionsCount,
            notifications: 0, // TODO: Implement notifications system
          });
        }
      } catch (error) {
        console.error('Error fetching tab counts:', error);
      }
    };

    fetchTabCounts();

    // Set up subscription for real-time updates
    const betSubscription = client.models.Bet.observeQuery().subscribe({
      next: () => {
        fetchTabCounts();
      },
      error: (error) => {
        console.error('Tab count subscription error:', error);
      }
    });

    const participantSubscription = client.models.Participant.observeQuery().subscribe({
      next: () => {
        fetchTabCounts();
      },
      error: (error) => {
        console.error('Tab participant subscription error:', error);
      }
    });

    return () => {
      betSubscription.unsubscribe();
      participantSubscription.unsubscribe();
    };
  }, [user]);

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
        return tabCounts.notifications > 0 ? tabCounts.notifications : null;
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