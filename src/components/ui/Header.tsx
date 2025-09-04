/**
 * Header Component
 * Professional sportsbook header with balance, notifications, and branding
 */

import React from 'react';
import {
  View,
  Text,
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
  onMenuPress?: () => void;
  rightComponent?: React.ReactNode;
  variant?: 'default' | 'transparent' | 'minimal';
  notificationCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBalance = true,
  balance = 1245.75,
  onBalancePress,
  onNotificationsPress,
  onMenuPress,
  rightComponent,
  variant = 'default',
  notificationCount = 0,
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
          {/* Left Section - Logo/Title */}
          <View style={styles.leftSection}>
            {onMenuPress ? (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={onMenuPress}
              >
                <Ionicons name="menu" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.logoContainer}>
                <View style={styles.logoIcon}>
                  <Text style={styles.logoText}>SB</Text>
                </View>
                <Text style={styles.logoTitle}>SideBet</Text>
              </View>
            )}
            
            {title && (
              <Text style={styles.title}>{title}</Text>
            )}
          </View>

          {/* Right Section - Balance & Notifications */}
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

            {onNotificationsPress && (
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={onNotificationsPress}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name="notifications-outline" 
                  size={22} 
                  color={colors.textPrimary} 
                />
                {notificationCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.moreButton}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="ellipsis-horizontal" 
                size={20} 
                color={colors.textPrimary} 
              />
            </TouchableOpacity>

            {rightComponent}
          </View>
        </View>

        {/* Live Events Banner (when applicable) */}
        <LiveEventsBanner />
      </View>
    </>
  );
};

// Live events banner component
const LiveEventsBanner: React.FC = () => {
  return (
    <TouchableOpacity style={styles.liveBanner} activeOpacity={0.9}>
      <View style={styles.liveBannerContent}>
        <View style={styles.liveBannerLeft}>
          <View style={styles.liveIndicator} />
          <Text style={styles.liveBannerText}>LIVE</Text>
          <Text style={styles.liveBannerEvent}>Crypto.com Arena</Text>
        </View>
        
        <View style={styles.liveBannerRight}>
          <Text style={styles.liveBannerScore}>LAL 89 - 92 GSW</Text>
          <Text style={styles.liveBannerTime}>03:42</Text>
        </View>
        
        <View style={styles.liveBannerBets}>
          <Text style={styles.liveBannerBetsText}>12 LIVE BETS</Text>
        </View>
      </View>
    </TouchableOpacity>
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
    gap: spacing.sm,
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
  notificationButton: {
    padding: spacing.xs,
    position: 'relative',
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
  },
  moreButton: {
    padding: spacing.xs,
  },
  
  // Live banner
  liveBanner: {
    backgroundColor: colors.live,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  liveBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  liveBannerEvent: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },
  liveBannerRight: {
    alignItems: 'center',
  },
  liveBannerScore: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  liveBannerTime: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontSize: 11,
  },
  liveBannerBets: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    marginLeft: spacing.sm,
  },
  liveBannerBetsText: {
    ...textStyles.status,
    color: colors.live,
    fontSize: 10,
  },
});