/**
 * Custom Tab Bar Component
 * Professional sportsbook-style bottom navigation
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();

  const getTabIcon = (routeName: string, focused: boolean) => {
    let iconName: keyof typeof Ionicons.glyphMap;
    
    switch (routeName) {
      case 'Bets':
        iconName = focused ? 'receipt' : 'receipt-outline';
        break;
      case 'Live':
        iconName = focused ? 'pulse' : 'pulse-outline';
        break;
      case 'Create':
        iconName = focused ? 'add-circle' : 'add-circle-outline';
        break;
      case 'Resolve':
        iconName = focused ? 'trophy' : 'trophy-outline';
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
        return 'My Bets';
      case 'Live':
        return 'Live';
      case 'Create':
        return 'Create';
      case 'Resolve':
        return 'Results';
      case 'Account':
        return 'Profile';
      default:
        return routeName;
    }
  };

  const getTabCount = (routeName: string): number | null => {
    switch (routeName) {
      case 'Bets':
        return 3; // Active bets count
      case 'Live':
        return 12; // Live events count
      case 'Resolve':
        return 2; // Pending resolutions count
      case 'Account':
        return 2; // Notifications count
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
        const isLiveTab = route.name === 'Live';
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
            
            {/* Live pulsing indicator for Live tab */}
            {isLiveTab && (
              <View style={styles.livePulseIndicator} />
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
                    : colors.textMuted
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
    backgroundColor: colors.primary,
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  createIconContainerFocused: {
    backgroundColor: colors.primaryDark,
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
  
  // Live pulsing indicator
  livePulseIndicator: {
    position: 'absolute',
    top: 4,
    left: '50%',
    transform: [{ translateX: -3 }],
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.live,
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