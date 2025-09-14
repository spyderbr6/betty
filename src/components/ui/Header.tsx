/**
 * Header Component
 * Professional sportsbook header with balance, notifications, and branding
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { formatCurrency } from '../../utils/formatting';

interface HeaderProps {
  title?: string;
  showBalance?: boolean;
  balance?: number;
  onBalancePress?: () => void;
  onNotificationsPress?: () => void;
  rightComponent?: React.ReactNode;
  variant?: 'default' | 'transparent' | 'minimal';
  notificationCount?: number;
  // Live game data
  liveGame?: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    quarter: string;
    timeLeft: string;
    venue: string;
    liveBetsCount: number;
  };
  // Search and filter
  onSearchChange?: (query: string) => void;
  searchQuery?: string;
  onFilterPress?: () => void;
  showSearch?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBalance = true,
  balance = 1245.75,
  onBalancePress,
  onNotificationsPress,
  rightComponent,
  variant = 'default',
  notificationCount = 0,
  liveGame,
  onSearchChange,
  searchQuery = '',
  onFilterPress,
  showSearch = true,
}) => {
  const insets = useSafeAreaInsets();

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
              <TouchableOpacity
                style={styles.balanceContainer}
                onPress={onBalancePress}
                activeOpacity={0.8}
              >
                <Text style={styles.balanceLabel}>BALANCE</Text>
                <Text style={styles.balanceAmount}>
                  {formatCurrency(balance, 'USD', true)}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={onNotificationsPress}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="notifications-outline" 
                size={18} 
                color={colors.textSecondary} 
              />
              {notificationCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="ellipsis-horizontal" 
                size={18} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>

            {rightComponent}
          </View>
        </View>

        {/* Live Game Banner */}
        {liveGame && (
          <TouchableOpacity style={styles.liveBanner} activeOpacity={0.9}>
            <View style={styles.liveBannerContent}>
              <View style={styles.liveBannerLeft}>
                <View style={styles.liveIndicator} />
                <Text style={styles.liveBannerText}>LIVE</Text>
                <Text style={styles.liveBannerVenue}>{liveGame.venue}</Text>
              </View>
              
              <View style={styles.liveBannerCenter}>
                <Text style={styles.liveBannerScore}>
                  {liveGame.homeTeam} {liveGame.homeScore} - {liveGame.awayScore} {liveGame.awayTeam}
                </Text>
                <Text style={styles.liveBannerTime}>{liveGame.quarter} {liveGame.timeLeft}</Text>
              </View>
              
              <View style={styles.liveBannerRight}>
                <Text style={styles.liveBannerBetsText}>
                  {liveGame.liveBetsCount} LIVE BETS
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        
        {/* Search and Filter Bar */}
        {showSearch && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons 
                name="search" 
                size={16} 
                color={colors.textMuted} 
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search bets..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={onSearchChange}
              />
            </View>
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={onFilterPress}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="options-outline" 
                size={16} 
                color={colors.textSecondary} 
              />
              <Text style={styles.filterText}>Filter</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    lineHeight: typography.lineHeight.tight * 10,
  },
  
  // Live banner
  liveBanner: {
    backgroundColor: colors.live,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  liveBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
    marginRight: spacing.xs,
  },
  liveBannerText: {
    ...textStyles.status,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginRight: spacing.sm,
  },
  liveBannerVenue: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    fontSize: 14,
  },
  liveBannerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  liveBannerScore: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: 20,
    fontFamily: typography.fontFamily.mono,
  },
  liveBannerTime: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontSize: 11,
    fontFamily: typography.fontFamily.mono,
  },
  liveBannerRight: {
    alignItems: 'flex-end',
  },
  liveBannerBetsText: {
    ...textStyles.status,
    color: colors.textPrimary,
    fontSize: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  
  // Search and filter
  searchContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    // gap is not supported on native; use margin on children
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    // space between icon and text via text marginLeft
  },
  filterText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginLeft: 4,
  },
});
