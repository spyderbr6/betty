/**
 * Account Screen
 * User profile and account management
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, commonStyles, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { formatCurrency, formatPercentage } from '../utils/formatting';

// Mock user stats
const mockUserStats = {
  winRate: 67.3,
  totalBets: 23,
  trustScore: 8.4,
  totalProfit: 342.50,
  currentStreak: 5,
  favoriteCategory: 'SPORTS',
};

export const AccountScreen: React.FC = () => {
  const handleSettingsPress = () => {
    console.log('Settings pressed');
  };

  const handleStatsPress = () => {
    console.log('Stats pressed');
  };

  const handleHistoryPress = () => {
    console.log('History pressed');
  };

  const handleSupportPress = () => {
    console.log('Support pressed');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        title="Account"
        showBalance={true}
        balance={1245.75}
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Profile */}
        <View style={styles.profileSection}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>JD</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.username}>john_doe_23</Text>
              <Text style={styles.email}>john@example.com</Text>
              <View style={styles.trustContainer}>
                <Text style={styles.trustLabel}>Trust Score</Text>
                <Text style={styles.trustScore}>{mockUserStats.trustScore}/10</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatPercentage(mockUserStats.winRate)}</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{mockUserStats.totalBets}</Text>
              <Text style={styles.statLabel}>Total Bets</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(mockUserStats.totalProfit)}</Text>
              <Text style={styles.statLabel}>Total Profit</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{mockUserStats.currentStreak}</Text>
              <Text style={styles.statLabel}>Current Streak</Text>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuSection}>
          <MenuOption
            icon="bar-chart-outline"
            title="Detailed Stats"
            subtitle="View comprehensive betting analytics"
            onPress={handleStatsPress}
          />
          <MenuOption
            icon="time-outline"
            title="Betting History"
            subtitle="Review past bets and outcomes"
            onPress={handleHistoryPress}
          />
          <MenuOption
            icon="card-outline"
            title="Payment Methods"
            subtitle="Manage deposits and withdrawals"
          />
          <MenuOption
            icon="shield-checkmark-outline"
            title="Trust & Safety"
            subtitle="Security settings and verification"
          />
          <MenuOption
            icon="settings-outline"
            title="Settings"
            subtitle="App preferences and notifications"
            onPress={handleSettingsPress}
          />
          <MenuOption
            icon="help-circle-outline"
            title="Support"
            subtitle="Get help and contact support"
            onPress={handleSupportPress}
          />
          <MenuOption
            icon="information-circle-outline"
            title="About"
            subtitle="App version and legal information"
          />
        </View>

        {/* Sign Out */}
        <View style={styles.signOutSection}>
          <TouchableOpacity style={styles.signOutButton}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Menu Option Component
interface MenuOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress?: () => void;
  showArrow?: boolean;
}

const MenuOption: React.FC<MenuOptionProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  showArrow = true,
}) => {
  return (
    <TouchableOpacity 
      style={styles.menuOption}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.menuOptionLeft}>
        <View style={styles.menuIconContainer}>
          <Ionicons name={icon} size={22} color={colors.textSecondary} />
        </View>
        <View style={styles.menuOptionContent}>
          <Text style={styles.menuOptionTitle}>{title}</Text>
          <Text style={styles.menuOptionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {showArrow && (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },
  
  // Profile section
  profileSection: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...textStyles.h3,
    color: colors.background,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  email: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  trustContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  trustScore: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: '600',
  },
  
  // Stats section
  statsSection: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // gap is not supported on native; use margins on cards
  },
  statCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: spacing.radius.lg,
    alignItems: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  statValue: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  
  // Menu section
  menuSection: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuOptionContent: {
    flex: 1,
  },
  menuOptionTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  menuOptionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  
  // Sign out section
  signOutSection: {
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  signOutText: {
    ...textStyles.button,
    color: colors.error,
    marginLeft: spacing.xs,
  },
});
