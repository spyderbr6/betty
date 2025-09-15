/**
 * Account Screen
 * User profile and account management
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, commonStyles, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { formatCurrency, formatPercentage } from '../utils/formatting';
import { useAuth } from '../contexts/AuthContext';

// Initialize GraphQL client
const client = generateClient<Schema>();

// User stats interface matching our Amplify User model
interface UserStats {
  balance: number;
  trustScore: number;
  totalBets: number;
  totalWinnings: number;
  winRate: number;
  username: string;
  email: string;
}

export const AccountScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserStats();
    }
  }, [user]);

  const fetchUserStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Try to get existing user data
      const { data: userData } = await client.models.User.get({ id: user.userId });

      if (userData) {
        setUserStats({
          balance: userData.balance || 0,
          trustScore: userData.trustScore || 5.0,
          totalBets: userData.totalBets || 0,
          totalWinnings: userData.totalWinnings || 0,
          winRate: userData.winRate || 0,
          username: userData.username || user.username,
          email: userData.email || '',
        });
      } else {
        // Create user record if it doesn't exist
        const newUser = await client.models.User.create({
          id: user.userId,
          username: user.username,
          email: `${user.username}@example.com`, // Placeholder email
          balance: 1000, // Starting balance
          trustScore: 5.0,
          totalBets: 0,
          totalWinnings: 0,
          winRate: 0,
        });

        if (newUser.data) {
          setUserStats({
            balance: newUser.data.balance || 1000,
            trustScore: newUser.data.trustScore || 5.0,
            totalBets: newUser.data.totalBets || 0,
            totalWinnings: newUser.data.totalWinnings || 0,
            winRate: newUser.data.winRate || 0,
            username: newUser.data.username || user.username,
            email: newUser.data.email || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
      Alert.alert(
        'Error',
        'Failed to load user stats. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchUserStats();
    } finally {
      setRefreshing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert(
                'Error',
                'Failed to sign out. Please try again.',
                [{ text: 'OK' }]
              );
            }
          }
        },
      ]
    );
  };

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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Account" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!userStats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Account" />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load profile</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchUserStats()}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Generate avatar initials from username
  const avatarInitials = userStats.username
    .split('_')
    .map(part => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
      />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* User Profile */}
        <View style={styles.profileSection}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarInitials}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.username}>{userStats.username}</Text>
              <Text style={styles.email}>{userStats.email}</Text>
              <View style={styles.trustContainer}>
                <Text style={styles.trustLabel}>Trust Score</Text>
                <Text style={styles.trustScore}>{userStats.trustScore.toFixed(1)}/10</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatPercentage(userStats.winRate)}</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userStats.totalBets}</Text>
              <Text style={styles.statLabel}>Total Bets</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(userStats.totalWinnings)}</Text>
              <Text style={styles.statLabel}>Total Winnings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userStats.balance > 1000 ? '📈' : '💰'}</Text>
              <Text style={styles.statLabel}>Status</Text>
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
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
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

  // Loading and Error States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  errorText: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.lg,
  },
  retryButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: '600',
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
