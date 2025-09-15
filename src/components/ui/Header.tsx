/**
 * Header Component
 * Professional sportsbook header with balance, notifications, and branding
 */

import React, { useState } from 'react';
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
import { UserBalance } from './UserBalance';
import { LiveGameBanner, LiveGameData } from './LiveGameBanner';
import { FeedbackModal, FeedbackData } from './FeedbackModal';
import { submitFeedbackToGitHub } from '../../utils/github';

interface HeaderProps {
  title?: string;
  showBalance?: boolean;
  onBalancePress?: () => void;
  onNotificationsPress?: () => void;
  onMenuPress?: () => void;
  rightComponent?: React.ReactNode;
  variant?: 'default' | 'transparent' | 'minimal';
  notificationCount?: number;
  // Live game data
  liveGame?: LiveGameData;
  // Search and filter
  onSearchChange?: (query: string) => void;
  searchQuery?: string;
  onFilterPress?: () => void;
  showSearch?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBalance = true,
  onBalancePress,
  onNotificationsPress,
  onMenuPress,
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
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress();
    } else {
      // Default behavior: show feedback modal
      setShowFeedbackModal(true);
    }
  };

  const handleFeedbackSubmit = async (feedback: FeedbackData) => {
    await submitFeedbackToGitHub(feedback);
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
              onPress={handleMenuPress}
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
          <LiveGameBanner
            liveGame={liveGame}
            variant="default"
            showBetsCount={true}
            showVenue={true}
          />
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

      {/* Feedback Modal */}
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        onSubmit={handleFeedbackSubmit}
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
    textAlignVertical: 'center',
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
