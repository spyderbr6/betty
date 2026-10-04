/**
 * Account Screen
 * User profile and account management
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
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
import { AdminDisputeScreen } from './AdminDisputeScreen';
import { AdminTestingScreen } from './AdminTestingScreen';
import { SubscriptionScreen } from './SubscriptionScreen';
import { useAuth } from '../contexts/AuthContext';
import { ProfileEditForm, User } from '../types/betting';
import { getProfilePictureUrl, updateProfilePicture } from '../services/imageUploadService';
import { showAlert } from '../components/ui/CustomAlert';
import { ensureUserRecord } from '../services/userRecordService';

// Initialize GraphQL client
const client = generateClient<Schema>();

// Enhanced user interface with profile data
interface UserProfile extends User {
  // All User fields are already included from the imported type
}

export const AccountScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
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
  const [showSubscription, setShowSubscription] = useState(false);
  const [friendsInitialShowRequests, setFriendsInitialShowRequests] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  // The S3 key behind userProfile.profilePictureUrl (which holds a signed URL for display).
  // The upload service needs the key to delete the picture being replaced.
  const [profilePictureKey, setProfilePictureKey] = useState<string | undefined>(undefined);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const hasLoadedRef = useRef(false);

  // Keyed on fields, not the user object, which AuthContext replaces on every silent auth
  // refresh. The picture key is included so a picture set elsewhere (onboarding refreshes
  // auth after its upload) still reaches this screen.
  useEffect(() => {
    if (user) {
      fetchUserStats();
    }
  }, [user?.userId, user?.profilePictureUrl]);

  // Handle navigation params (e.g., from notification tap)
  useEffect(() => {
    const params = route.params as { openFriendRequests?: boolean } | undefined;
    if (params?.openFriendRequests) {
      setFriendsInitialShowRequests(true);
      setShowFriendsScreen(true);
      // Clear the param so it doesn't re-trigger on re-render
      navigation.setParams({ openFriendRequests: undefined } as any);
    }
  }, [route.params]);

  const fetchUserStats = async () => {
    if (!user) return;

    try {
      // Full-screen spinner on the first load only. Later loads (pull-to-refresh, after a
      // profile save) update in place rather than blanking the screen.
      if (!hasLoadedRef.current) setIsLoading(true);

      // Independent reads, so run them together rather than one after another.
      const [userAttributes, userData] = await Promise.all([
        fetchUserAttributes().catch((error) => {
          console.log('Could not fetch Cognito user attributes:', error);
          return null;
        }),
        // Creates the record if it is missing: the retry for a create that failed at
        // sign-in, without waiting for the next auth check.
        ensureUserRecord({ userId: user.userId, username: user.username }),
        fetchPendingPayouts(),
      ]);
      const displayNameFromCognito = userAttributes?.name || '';
      const realEmail = userAttributes?.email || user.username;

      if (userData) {
        // Update existing user with real email if it's a placeholder
        let shouldUpdate = false;
        let updateData: any = {};

        if (userData.email?.includes('@example.com') || !userData.email?.includes('@')) {
          updateData.email = realEmail;
          shouldUpdate = true;
        }

        // Fix displayName if it's missing OR if it looks like a hash (32 char UUID)
        const isHashLike = userData.displayName &&
                          userData.displayName.length === 32 &&
                          /^[a-f0-9]{32}$/.test(userData.displayName.toLowerCase());

        if ((!userData.displayName || isHashLike) && displayNameFromCognito) {
          updateData.displayName = displayNameFromCognito;
          updateData.displayNameLower = displayNameFromCognito.toLowerCase();
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

        // profilePictureUrl on the record is the S3 key; the screen needs a signed URL
        let profilePictureUrl = undefined;
        if (userData.profilePictureUrl) {
          const signedUrl = await getProfilePictureUrl(userData.profilePictureUrl);
          profilePictureUrl = signedUrl || undefined;
        }

        setProfilePictureKey(userData.profilePictureUrl || undefined);
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
        // ensureUserRecord tried to create it and could not; Try Again tries again
        console.warn('[AccountScreen] No User record for:', user.userId);
      }

      hasLoadedRef.current = true;
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
      // PENDING BET_WON transactions for this user, through the userId index rather than a
      // filtered Scan of the whole table. A filter applies to the rows read, not the rows
      // returned, so a page can come back short or empty while more matches remain:
      // follow nextToken until it runs out.
      const pendingTransactions: Schema['Transaction']['type'][] = [];
      let nextToken: string | null | undefined;
      do {
        const page = await client.models.Transaction.transactionsByUser(
          { userId: user.userId },
          {
            filter: {
              and: [
                { type: { eq: 'BET_WON' } },
                { status: { eq: 'PENDING' } },
              ],
            },
            nextToken,
          }
        );
        pendingTransactions.push(...(page.data || []));
        nextToken = page.nextToken;
      } while (nextToken);

      // Calculate total pending payouts (use actualAmount for net after fees)
      const total = pendingTransactions.reduce((sum, transaction) => {
        // Use actualAmount (net after fees) if available, otherwise fall back to amount
        const netAmount = transaction.actualAmount !== undefined && transaction.actualAmount !== null
          ? transaction.actualAmount
          : transaction.amount || 0;
        return sum + netAmount;
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

  // Tapping the avatar goes straight to the picker; no editor screen in between.
  // Same sequence as onboarding's picture step: upload, then save the S3 key on the User.
  const handleAvatarPress = async () => {
    if (!userProfile || isUploadingPicture) return;

    try {
      setIsUploadingPicture(true);

      const result = await updateProfilePicture(userProfile.id, profilePictureKey);
      if (!result.success || !result.url) {
        // Closing the picker without choosing is not an error
        if (result.error && result.error !== 'Image selection cancelled') {
          showAlert('Error', result.error);
        }
        return;
      }

      // result.url is the S3 key, not a displayable URL
      const s3Key = result.url;
      await client.models.User.update({ id: userProfile.id, profilePictureUrl: s3Key });
      const signedUrl = await getProfilePictureUrl(s3Key);

      setProfilePictureKey(s3Key);
      setUserProfile((current) =>
        current ? { ...current, profilePictureUrl: signedUrl || undefined } : current
      );
    } catch (error) {
      console.error('Error updating profile picture:', error);
      showAlert('Error', 'Failed to update profile picture. Please try again.');
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleSaveProfile = async (profileData: ProfileEditForm) => {
    if (!userProfile) return;

    try {
      setIsUpdatingProfile(true);

      // The editor only edits the display name; the picture is changed from the avatar
      const updatedUser = await client.models.User.update({
        id: userProfile.id,
        displayName: profileData.displayName,
        displayNameLower: profileData.displayName ? profileData.displayName.toLowerCase() : undefined,
      });

      if (updatedUser.data) {
        setUserProfile({
          ...userProfile,
          displayName: updatedUser.data.displayName || undefined,
          updatedAt: updatedUser.data.updatedAt || new Date().toISOString(),
        });

        setShowProfileEditor(false);
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
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-account">
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
              onPress={handleAvatarPress}
              disabled={isUploadingPicture}
              activeOpacity={0.7}
              testID="account-avatar"
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
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
                {isUploadingPicture ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.background} />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <TouchableOpacity onPress={handleEditProfile} activeOpacity={0.7} testID="account-edit-name">
                <Text style={styles.displayName}>
                  {userProfile.displayName || 'Set Display Name'}
                </Text>
              </TouchableOpacity>

              {/* Balance Breakdown */}
              <View style={styles.balanceBreakdown}>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Available:</Text>
                  <Text style={styles.balanceValue}>${userProfile.balance.toFixed(2)}</Text>
                </View>
                {pendingPayouts > 0 && (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Pending Payouts:</Text>
                    <Text style={styles.pendingValue} testID="account-pending-payouts">${pendingPayouts.toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Trust Score:</Text>
                  <Text style={styles.trustScore}>{userProfile.trustScore.toFixed(1)}/10</Text>
                </View>
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
                testID="account-admin-dashboard"
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

              {__DEV__ && (
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
              )}
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
            icon={user?.subscriptionTier === 'PRO' ? 'star' : 'star-outline'}
            title={user?.subscriptionTier === 'PRO' ? 'Pro Membership' : 'Upgrade to Pro'}
            subtitle={user?.subscriptionTier === 'PRO' ? '0% fees on everything · $4.99/mo' : 'Remove all fees for $4.99/month'}
            onPress={() => setShowSubscription(true)}
          />
          <MenuOption
            icon="shield-checkmark-outline"
            title="Trust & Safety"
            subtitle="Security settings and verification"
            onPress={handleTrustSafetyPress}
            testID="account-trust-safety"
          />
          <MenuOption
            icon="settings-outline"
            title="Settings"
            subtitle="App preferences and notifications"
            onPress={handleSettingsPress}
            testID="account-settings"
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
            testID="account-sign-out"
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
        presentationStyle="fullScreen"
        onRequestClose={handleCancelProfileEdit}
      >
        {showProfileEditor && (
          <ProfileEditor
            user={userProfile}
            onSave={handleSaveProfile}
            onCancel={handleCancelProfileEdit}
            loading={isUpdatingProfile}
          />
        )}
      </Modal>

      {/* Friends Screen Modal */}
      <Modal
        visible={showFriendsScreen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFriendsScreen(false)}
      >
        {showFriendsScreen && (
          <FriendsScreen
            onClose={() => {
              setShowFriendsScreen(false);
              setFriendsInitialShowRequests(false);
            }}
            initialShowRequests={friendsInitialShowRequests}
          />
        )}
      </Modal>

      {/* Detailed Stats Modal */}
      <Modal
        visible={showDetailedStats}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowDetailedStats(false)}
      >
        {showDetailedStats && (
          <DetailedStatsScreen onClose={() => setShowDetailedStats(false)} />
        )}
      </Modal>

      {/* Betting History Modal */}
      <Modal
        visible={showBettingHistory}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowBettingHistory(false)}
      >
        {showBettingHistory && (
          <BettingHistoryScreen
            onClose={() => setShowBettingHistory(false)}
            navigation={navigation}
          />
        )}
      </Modal>

      {/* Payment Methods Modal */}
      <Modal
        visible={showPaymentMethods}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPaymentMethods(false)}
      >
        {showPaymentMethods && (
          <PaymentMethodsScreen onClose={() => setShowPaymentMethods(false)} />
        )}
      </Modal>

      {/* Trust & Safety Modal */}
      <Modal
        visible={showTrustSafety}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowTrustSafety(false)}
      >
        {showTrustSafety && (
          <TrustSafetyScreen onClose={() => setShowTrustSafety(false)} />
        )}
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSettings(false)}
      >
        {showSettings && (
          <SettingsScreen onClose={() => setShowSettings(false)} />
        )}
      </Modal>

      {/* Support Modal */}
      <Modal
        visible={showSupport}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSupport(false)}
      >
        {showSupport && (
          <SupportScreen onClose={() => setShowSupport(false)} />
        )}
      </Modal>

      {/* About Modal */}
      <Modal
        visible={showAbout}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAbout(false)}
      >
        {showAbout && (
          <AboutScreen onClose={() => setShowAbout(false)} />
        )}
      </Modal>

      {/* Admin Dashboard Modal */}
      <Modal
        visible={showAdminDashboard}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAdminDashboard(false)}
      >
        {showAdminDashboard && (
          <AdminDashboardScreen onClose={() => setShowAdminDashboard(false)} />
        )}
      </Modal>

      {/* Admin Dispute Modal */}
      {showAdminDispute && (
        <AdminDisputeScreen onClose={() => setShowAdminDispute(false)} />
      )}

      {/* Admin Testing Modal — dev builds only */}
      {__DEV__ && (
        <Modal
          visible={showAdminTesting}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowAdminTesting(false)}
        >
          {showAdminTesting && (
            <AdminTestingScreen onClose={() => setShowAdminTesting(false)} />
          )}
        </Modal>
      )}

      {/* Subscription Modal */}
      <Modal
        visible={showSubscription}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSubscription(false)}
      >
        {showSubscription && (
          <SubscriptionScreen onClose={() => setShowSubscription(false)} />
        )}
      </Modal>

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelSignOut}
      >
        {showSignOutConfirm && (
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
                  testID="account-sign-out-confirm"
                  activeOpacity={0.8}
                >
                  <Text style={styles.signOutConfirmButtonText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
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
  testID?: string;
}

const MenuOption: React.FC<MenuOptionProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  showArrow = true,
  testID,
}) => {
  return (
    <TouchableOpacity 
      style={styles.menuOption}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID}
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
