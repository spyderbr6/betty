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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } from '../constants/policies';
import { TrustSafetyScreen } from './TrustSafetyScreen';
import { SettingsScreen } from './SettingsScreen';
import { SupportScreen } from './SupportScreen';
import { AboutScreen } from './AboutScreen';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { AdminDisputeScreen } from './AdminDisputeScreen';
import { AdminTestingScreen } from './AdminTestingScreen';
import { useAuth } from '../contexts/AuthContext';
import { ProfileEditForm, User } from '../types/betting';
import { getProfilePictureUrl } from '../services/imageUploadService';
import { NotificationPreferencesService } from '../services/notificationPreferencesService';
import { showAlert } from '../components/ui/CustomAlert';

// Initialize GraphQL client
const client = generateClient<Schema>();

// Enhanced user interface with profile data
interface UserProfile extends User {
  // All User fields are already included from the imported type
}

export const AccountScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
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
  const [showAdminDispute, setShowAdminDispute] = useState(false);
  const [showAdminTesting, setShowAdminTesting] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [pendingPayouts, setPendingPayouts] = useState(0);

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
        // Note: Policy acceptance is implicitly true for new users since SignUp requires
        // checkbox acceptance before creating Cognito account
        const currentTime = new Date().toISOString();
        const newUser = await client.models.User.create({
          id: user.userId,
          username: user.username,
          email: realEmail,
          displayName: displayNameFromCognito || undefined,
          balance: 0, // Starting balance
          trustScore: 5.0,
          totalBets: 0,
          totalWinnings: 0,
          winRate: 0,
          // Policy acceptance - required during signup
          tosAccepted: true,
          tosAcceptedAt: currentTime,
          tosVersion: CURRENT_TOS_VERSION,
          privacyPolicyAccepted: true,
          privacyPolicyAcceptedAt: currentTime,
          privacyPolicyVersion: CURRENT_PRIVACY_VERSION,
        });

        if (newUser.data) {
          // Create default notification preferences for new user
          // This ensures notifications work immediately without race conditions
          try {
            await NotificationPreferencesService.createDefaultPreferences(newUser.data.id!);
            console.log('[AccountScreen] Created default notification preferences for new user:', newUser.data.id);
          } catch (prefError) {
            console.error('[AccountScreen] Failed to create notification preferences for new user:', prefError);
            // Don't block user creation if preferences fail - they'll be created on first notification
          }

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
            balance: newUser.data.balance ?? 0,
            trustScore: newUser.data.trustScore || 5.0,
            totalBets: newUser.data.totalBets || 0,
            totalWinnings: newUser.data.totalWinnings || 0,
            winRate: newUser.data.winRate || 0,
            createdAt: newUser.data.createdAt || new Date().toISOString(),
            updatedAt: newUser.data.updatedAt || new Date().toISOString(),
          });
        }
      }

      // Fetch pending payouts
      await fetchPendingPayouts();

    } catch (error) {
      console.error('Error fetching user stats:', error);
      showAlert(
        'Error',
        'Failed to load user stats. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingPayouts = async () => {
    if (!user) return;

    try {
      // Get all PENDING transactions of type BET_WON for this user
      const { data: pendingTransactions } = await client.models.Transaction.list({
        filter: {
          and: [
            { userId: { eq: user.userId } },
            { type: { eq: 'BET_WON' } },
            { status: { eq: 'PENDING' } }
          ]
        }
      });

      // Calculate total pending payouts
      const total = pendingTransactions?.reduce((sum, transaction) => {
        return sum + (transaction.amount || 0);
      }, 0) || 0;

      setPendingPayouts(total);

    } catch (error) {
      console.error('Error fetching pending payouts:', error);
      // Don't show alert for this, it's not critical
      setPendingPayouts(0);
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
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      showAlert(
        'Error',
        'Failed to sign out. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const cancelSignOut = () => {
    setShowSignOutConfirm(false);
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

  const handleAdminDisputePress = () => {
    setShowAdminDispute(true);
  };

  const handleAdminTestingPress = () => {
    setShowAdminTesting(true);
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

        showAlert('Success', 'Profile updated successfully!');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showAlert('Error', 'Failed to update profile. Please try again.');
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
        contentContainerStyle={{ paddingBottom: spacing.navigation.baseHeight + insets.bottom }}
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
                  resizeMode="cover"
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

              {/* Balance Breakdown */}
              <View style={styles.balanceBreakdown}>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Available:</Text>
                  <Text style={styles.balanceValue}>${userProfile.balance.toFixed(2)}</Text>
                </View>
                {pendingPayouts > 0 && (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Pending Payouts:</Text>
                    <Text style={styles.pendingValue}>${pendingPayouts.toFixed(2)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.trustContainer}>
                <Text style={styles.trustLabel}>Trust Score</Text>
                <Text style={styles.trustScore}>{userProfile.trustScore.toFixed(1)}/10</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuSection}>
          {/* Admin Dashboard - Only show for admin users */}
          {(user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
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

              <TouchableOpacity
                style={styles.menuOption}
                onPress={handleAdminDisputePress}
                activeOpacity={0.7}
              >
                <View style={styles.menuOptionLeft}>
                  <View style={[styles.menuIconContainer, styles.adminIconContainer]}>
                    <Ionicons name="alert-circle" size={22} color={colors.warning} />
                  </View>
                  <View style={styles.menuOptionContent}>
                    <View style={styles.adminTitleRow}>
                      <Text style={styles.menuOptionTitle}>Dispute Dashboard</Text>
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>ADMIN</Text>
                      </View>
                    </View>
                    <Text style={styles.menuOptionSubtitle}>Review and resolve user disputes</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuOption}
                onPress={handleAdminTestingPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuOptionLeft}>
                  <View style={[styles.menuIconContainer, styles.adminIconContainer]}>
                    <Ionicons name="flask" size={22} color={colors.warning} />
                  </View>
                  <View style={styles.menuOptionContent}>
                    <View style={styles.adminTitleRow}>
                      <Text style={styles.menuOptionTitle}>Admin Testing Tools</Text>
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>DEBUG</Text>
                      </View>
                    </View>
                    <Text style={styles.menuOptionSubtitle}>Test and debug system features</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

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

      {/* Admin Dispute Modal */}
      {showAdminDispute && (
        <AdminDisputeScreen onClose={() => setShowAdminDispute(false)} />
      )}

      {/* Admin Testing Modal */}
      <Modal
        visible={showAdminTesting}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAdminTesting(false)}
      >
        <AdminTestingScreen onClose={() => setShowAdminTesting(false)} />
      </Modal>

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelSignOut}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
              <Ionicons name="log-out-outline" size={32} color={colors.error} />
              <Text style={styles.confirmTitle}>Sign Out</Text>
            </View>
            <Text style={styles.confirmMessage}>Are you sure?</Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelButton]}
                onPress={cancelSignOut}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.signOutConfirmButton]}
                onPress={confirmSignOut}
                activeOpacity={0.8}
              >
                <Text style={styles.signOutConfirmButtonText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  balanceBreakdown: {
    marginVertical: spacing.xs,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border + '40',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs / 2,
  },
  balanceLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  balanceValue: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pendingValue: {
    ...textStyles.button,
    color: colors.warning,
    fontWeight: '600',
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

  // Sign Out Confirmation Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  confirmModal: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  confirmHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  confirmTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontWeight: '700',
  },
  confirmMessage: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  confirmButtons: {
    flexDirection: 'row',
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  cancelButtonText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  signOutConfirmButton: {
    backgroundColor: colors.error,
    marginLeft: spacing.xs,
  },
  signOutConfirmButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: '600',
  },
});
