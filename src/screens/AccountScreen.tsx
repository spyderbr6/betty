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
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import { fetchUserAttributes } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, commonStyles, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { ProfileEditor } from '../components/ui/ProfileEditor';
import { FriendsScreen } from './FriendsScreen';
import { DetailedStatsScreen } from './DetailedStatsScreen';
import { BettingHistoryScreen } from './BettingHistoryScreen';
import { PaymentMethodsScreen } from './PaymentMethodsScreen';
import { TrustSafetyScreen } from './TrustSafetyScreen';
import { SettingsScreen } from './SettingsScreen';
import { SupportScreen } from './SupportScreen';
import { AboutScreen } from './AboutScreen';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { formatCurrency, formatPercentage } from '../utils/formatting';
import { useAuth } from '../contexts/AuthContext';
import { ProfileEditForm, User } from '../types/betting';
import { getProfilePictureUrl } from '../services/imageUploadService';

// Initialize GraphQL client
const client = generateClient<Schema>();

// Enhanced user interface with profile data
interface UserProfile extends User {
  // All User fields are already included from the imported type
}

export const AccountScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showFriendsScreen, setShowFriendsScreen] = useState(false);
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [showBettingHistory, setShowBettingHistory] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [showTrustSafety, setShowTrustSafety] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserStats();
    }
  }, [user]);

  const fetchUserStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Always fetch real user info from Cognito first
      let displayNameFromCognito = '';
      let realEmail = user.username; // fallback
      try {
        const userAttributes = await fetchUserAttributes();
        displayNameFromCognito = userAttributes.name || '';
        realEmail = userAttributes.email || user.username;
      } catch (error) {
        console.log('Could not fetch Cognito user attributes:', error);
      }

      // Try to get existing user data
      const { data: userData } = await client.models.User.get({ id: user.userId });

      if (userData) {
        // Update existing user with real email if it's a placeholder
        let shouldUpdate = false;
        let updateData: any = {};

        if (userData.email?.includes('@example.com') || !userData.email?.includes('@')) {
          updateData.email = realEmail;
          shouldUpdate = true;
        }

        if (!userData.displayName && displayNameFromCognito) {
          updateData.displayName = displayNameFromCognito;
          shouldUpdate = true;
        }

        // Update user record if needed
        if (shouldUpdate) {
          try {
            await client.models.User.update({
              id: userData.id!,
              ...updateData
            });
          } catch (updateError) {
            console.log('Could not update user record:', updateError);
          }
        }

        // Get fresh signed URL for profile picture if it exists
        let profilePictureUrl = undefined;
        if (userData.profilePictureUrl) {
          const signedUrl = await getProfilePictureUrl(userData.profilePictureUrl);
          profilePictureUrl = signedUrl || undefined;
        }

        setUserProfile({
          id: userData.id!,
          username: userData.username!,
          email: updateData.email || userData.email!,
          displayName: updateData.displayName || userData.displayName || undefined,
          profilePictureUrl: profilePictureUrl,
          balance: userData.balance || 0,
          trustScore: userData.trustScore || 5.0,
          totalBets: userData.totalBets || 0,
          totalWinnings: userData.totalWinnings || 0,
          winRate: userData.winRate || 0,
          createdAt: userData.createdAt || new Date().toISOString(),
          updatedAt: userData.updatedAt || new Date().toISOString(),
        });
      } else {
        // Create user record if it doesn't exist (use already fetched Cognito data)
        const newUser = await client.models.User.create({
          id: user.userId,
          username: user.username,
          email: realEmail,
          displayName: displayNameFromCognito || undefined,
          balance: 1000, // Starting balance
          trustScore: 5.0,
          totalBets: 0,
          totalWinnings: 0,
          winRate: 0,
        });

        if (newUser.data) {
          // Get fresh signed URL for profile picture if it exists
          let profilePictureUrl = undefined;
          if (newUser.data.profilePictureUrl) {
            const signedUrl = await getProfilePictureUrl(newUser.data.profilePictureUrl);
            profilePictureUrl = signedUrl || undefined;
          }

          setUserProfile({
            id: newUser.data.id!,
            username: newUser.data.username!,
            email: newUser.data.email!,
            displayName: newUser.data.displayName || undefined,
            profilePictureUrl: profilePictureUrl,
            balance: newUser.data.balance || 1000,
            trustScore: newUser.data.trustScore || 5.0,
            totalBets: newUser.data.totalBets || 0,
            totalWinnings: newUser.data.totalWinnings || 0,
            winRate: newUser.data.winRate || 0,
            createdAt: newUser.data.createdAt || new Date().toISOString(),
            updatedAt: newUser.data.updatedAt || new Date().toISOString(),
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
    setShowSettings(true);
  };

  const handleStatsPress = () => {
    setShowDetailedStats(true);
  };

  const handleHistoryPress = () => {
    setShowBettingHistory(true);
  };

  const handleSupportPress = () => {
    setShowSupport(true);
  };

  const handlePaymentMethodsPress = () => {
    setShowPaymentMethods(true);
  };

  const handleTrustSafetyPress = () => {
    setShowTrustSafety(true);
  };

  const handleAboutPress = () => {
    setShowAbout(true);
  };

  const handleAdminDashboardPress = () => {
    setShowAdminDashboard(true);
  };

  const handleFriendsPress = () => {
    setShowFriendsScreen(true);
  };

  const handleEditProfile = () => {
    setShowProfileEditor(true);
  };

  const handleSaveProfile = async (profileData: ProfileEditForm) => {
    if (!userProfile) return;

    try {
      setIsUpdatingProfile(true);

      // Update user profile in database
      const updatedUser = await client.models.User.update({
        id: userProfile.id,
        displayName: profileData.displayName,
        profilePictureUrl: profileData.profilePicture,
      });

      if (updatedUser.data) {
        // Update local state
        setUserProfile({
          ...userProfile,
          displayName: updatedUser.data.displayName || undefined,
          profilePictureUrl: updatedUser.data.profilePictureUrl || undefined,
          updatedAt: updatedUser.data.updatedAt || new Date().toISOString(),
        });

        setShowProfileEditor(false);

        // Refresh user stats to ensure profile picture is updated everywhere
        await fetchUserStats();

        Alert.alert('Success', 'Profile updated successfully!');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleCancelProfileEdit = () => {
    setShowProfileEditor(false);
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

  if (!userProfile) {
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

  // Generate avatar initials from display name, fallback to username, then email
  const nameForAvatar = userProfile.displayName ||
                       userProfile.username ||
                       userProfile.email.split('@')[0];
  const avatarInitials = nameForAvatar
    .split(/[\s_.]/)
    .map(part => part[0]?.toUpperCase())
    .filter(Boolean)
    .join('')
    .slice(0, 2) || '??';

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
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handleEditProfile}
              activeOpacity={0.7}
            >
              {userProfile.profilePictureUrl ? (
                <Image
                  source={{ uri: userProfile.profilePictureUrl }}
                  style={styles.profileImage}
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{avatarInitials}</Text>
                </View>
              )}
              <View style={styles.editProfileBadge}>
                <Ionicons name="pencil" size={14} color={colors.background} />
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <TouchableOpacity onPress={handleEditProfile} activeOpacity={0.7}>
                <Text style={styles.displayName}>
                  {userProfile.displayName || 'Set Display Name'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.email}>{userProfile.email}</Text>
              <View style={styles.trustContainer}>
                <Text style={styles.trustLabel}>Trust Score</Text>
                <Text style={styles.trustScore}>{userProfile.trustScore.toFixed(1)}/10</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatPercentage(userProfile.winRate)}</Text>
              <Text style={styles.statLabel}>Win Rate</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userProfile.totalBets}</Text>
              <Text style={styles.statLabel}>Total Bets</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(userProfile.totalWinnings)}</Text>
              <Text style={styles.statLabel}>Total Winnings</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userProfile.balance > 1000 ? '📈' : '💰'}</Text>
              <Text style={styles.statLabel}>Status</Text>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuSection}>
          {/* Admin Dashboard - Show for all users during development */}
          <View style={styles.adminMenuOption}>
            <TouchableOpacity
              style={styles.menuOption}
              onPress={handleAdminDashboardPress}
              activeOpacity={0.7}
            >
              <View style={styles.menuOptionLeft}>
                <View style={[styles.menuIconContainer, styles.adminIconContainer]}>
                  <Ionicons name="shield-checkmark" size={22} color={colors.warning} />
                </View>
                <View style={styles.menuOptionContent}>
                  <View style={styles.adminTitleRow}>
                    <Text style={styles.menuOptionTitle}>Admin Dashboard</Text>
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>ADMIN</Text>
                    </View>
                  </View>
                  <Text style={styles.menuOptionSubtitle}>Approve deposits and withdrawals</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <MenuOption
            icon="people-outline"
            title="Friends"
            subtitle="Manage your friends and send invites"
            onPress={handleFriendsPress}
          />
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
            onPress={handlePaymentMethodsPress}
          />
          <MenuOption
            icon="shield-checkmark-outline"
            title="Trust & Safety"
            subtitle="Security settings and verification"
            onPress={handleTrustSafetyPress}
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
            onPress={handleAboutPress}
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

      {/* Profile Editor Modal */}
      <Modal
        visible={showProfileEditor}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <ProfileEditor
          user={userProfile}
          onSave={handleSaveProfile}
          onCancel={handleCancelProfileEdit}
          loading={isUpdatingProfile}
        />
      </Modal>

      {/* Friends Screen Modal */}
      <Modal
        visible={showFriendsScreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFriendsScreen(false)}
      >
        <FriendsScreen onClose={() => setShowFriendsScreen(false)} />
      </Modal>

      {/* Detailed Stats Modal */}
      <Modal
        visible={showDetailedStats}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowDetailedStats(false)}
      >
        <DetailedStatsScreen onClose={() => setShowDetailedStats(false)} />
      </Modal>

      {/* Betting History Modal */}
      <Modal
        visible={showBettingHistory}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowBettingHistory(false)}
      >
        <BettingHistoryScreen onClose={() => setShowBettingHistory(false)} />
      </Modal>

      {/* Payment Methods Modal */}
      <Modal
        visible={showPaymentMethods}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPaymentMethods(false)}
      >
        <PaymentMethodsScreen onClose={() => setShowPaymentMethods(false)} />
      </Modal>

      {/* Trust & Safety Modal */}
      <Modal
        visible={showTrustSafety}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowTrustSafety(false)}
      >
        <TrustSafetyScreen onClose={() => setShowTrustSafety(false)} />
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSettings(false)}
      >
        <SettingsScreen onClose={() => setShowSettings(false)} />
      </Modal>

      {/* Support Modal */}
      <Modal
        visible={showSupport}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSupport(false)}
      >
        <SupportScreen onClose={() => setShowSupport(false)} />
      </Modal>

      {/* About Modal */}
      <Modal
        visible={showAbout}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAbout(false)}
      >
        <AboutScreen onClose={() => setShowAbout(false)} />
      </Modal>

      {/* Admin Dashboard Modal */}
      <Modal
        visible={showAdminDashboard}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAdminDashboard(false)}
      >
        <AdminDashboardScreen onClose={() => setShowAdminDashboard(false)} />
      </Modal>
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
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarText: {
    ...textStyles.h3,
    color: colors.background,
    fontWeight: '700',
  },
  editProfileBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileInfo: {
    flex: 1,
  },
  displayName: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: '700',
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
  adminMenuOption: {
    borderBottomWidth: 2,
    borderBottomColor: colors.warning + '30',
  },
  adminTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  adminIconContainer: {
    backgroundColor: colors.warning + '20',
  },
  adminBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    marginLeft: spacing.xs,
  },
  adminBadgeText: {
    ...textStyles.caption,
    color: colors.background,
    fontWeight: '700',
    fontSize: 10,
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
