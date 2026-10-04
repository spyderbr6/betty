/**
 * Account Screen
 * The Account tab's home page: profile card (picture, name, trust score, Pro membership),
 * wallet card, and the way into Friends, Wallet, Settings and Help & About, which are
 * pages in the Account stack (navigation/AccountStack.tsx).
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, commonStyles, textStyles, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { ProfileEditor } from '../components/ui/ProfileEditor';
import type { WalletAction } from './WalletScreen';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { AdminDisputeScreen } from './AdminDisputeScreen';
import { AdminTestingScreen } from './AdminTestingScreen';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import { ProfileEditForm, User } from '../types/betting';
import type { AccountStackParamList } from '../types/navigation';
import { getProfilePictureUrl, updateProfilePicture } from '../services/imageUploadService';
import { showAlert } from '../components/ui/CustomAlert';
import { TransactionService } from '../services/transactionService';
import { membershipState } from '../config/subscriptionConfig';

// Initialize GraphQL client
const client = generateClient<Schema>();

// Enhanced user interface with profile data
interface UserProfile extends User {
  // All User fields are already included from the imported type
}

export const AccountScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  // The live User record, shared with the header balance and the Wallet (ProfileContext).
  // It creates the record if it is missing, and runs the one-time record repairs.
  const { profile, isLoading, refresh, applyUpdate } = useProfile();
  // The User record's id is the Cognito sub, which AuthContext already has as a string
  const profileId = user?.userId ?? '';
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<AccountStackParamList>>();
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showAdminDispute, setShowAdminDispute] = useState(false);
  const [showAdminTesting, setShowAdminTesting] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [pendingPayouts, setPendingPayouts] = useState(0);
  // Signed URL for the picture; the record holds the S3 key
  const [pictureUrl, setPictureUrl] = useState<string | undefined>(undefined);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);

  // The picture follows the record, so a change made anywhere (onboarding, another
  // device) shows up here
  const pictureKey = profile?.profilePictureUrl ?? undefined;
  useEffect(() => {
    let cancelled = false;
    if (!pictureKey) {
      setPictureUrl(undefined);
      return;
    }
    getProfilePictureUrl(pictureKey).then((url) => {
      if (!cancelled) setPictureUrl(url || undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [pictureKey]);

  const fetchPendingPayouts = useCallback(async () => {
    if (!user?.userId) return;
    // Shared with the Wallet; never throws (a failed read counts as nothing pending)
    setPendingPayouts(await TransactionService.getPendingPayoutTotal(user.userId));
  }, [user?.userId]);

  // Pending payouts are not part of the User record, so re-read them whenever this page
  // comes back into view (returning from the Wallet, or switching back to the tab). The
  // balance itself is live through ProfileContext.
  useFocusEffect(
    useCallback(() => {
      fetchPendingPayouts();
    }, [fetchPendingPayouts])
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([refresh(), fetchPendingPayouts()]);
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

  const openWallet = (initialAction?: WalletAction) => {
    navigation.navigate('Wallet', initialAction ? { initialAction } : undefined);
  };

  const openSubscription = () => {
    navigation.navigate('Subscription');
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

  const handleEditProfile = () => {
    setShowProfileEditor(true);
  };

  // Tapping the avatar goes straight to the picker; no editor screen in between.
  // Same sequence as onboarding's picture step: upload, then save the S3 key on the User.
  const handleAvatarPress = async () => {
    if (!profile || isUploadingPicture) return;

    try {
      setIsUploadingPicture(true);

      // The upload service needs the S3 key of the picture being replaced to delete it
      const result = await updateProfilePicture(profileId, pictureKey);
      if (!result.success || !result.url) {
        // Closing the picker without choosing is not an error
        if (result.error && result.error !== 'Image selection cancelled') {
          showAlert('Error', result.error);
        }
        return;
      }

      // result.url is the S3 key, not a displayable URL
      const s3Key = result.url;
      await client.models.User.update({ id: profileId, profilePictureUrl: s3Key });
      // Show it now rather than waiting for the subscription to echo the write
      applyUpdate({ profilePictureUrl: s3Key });
    } catch (error) {
      console.error('Error updating profile picture:', error);
      showAlert('Error', 'Failed to update profile picture. Please try again.');
    } finally {
      setIsUploadingPicture(false);
    }
  };

  const handleSaveProfile = async (profileData: ProfileEditForm) => {
    if (!profile) return;

    try {
      setIsUpdatingProfile(true);

      // The editor only edits the display name; the picture is changed from the avatar
      const updatedUser = await client.models.User.update({
        id: profileId,
        displayName: profileData.displayName,
        displayNameLower: profileData.displayName ? profileData.displayName.toLowerCase() : undefined,
      });

      if (updatedUser.data) {
        // Also updates AuthContext, so the new name is used everywhere (bet creator name,
        // card billing name) without waiting for the next sign-in
        applyUpdate({
          displayName: updatedUser.data.displayName,
          displayNameLower: updatedUser.data.displayNameLower,
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

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header title="Account" />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load profile</Text>
          <TouchableOpacity
            style={styles.retryButton}
            // ProfileContext's refresh creates the record if it is still missing
            onPress={() => refresh()}
            activeOpacity={0.8}
            testID="account-retry"
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // The shape ProfileEditor takes
  const userProfile: UserProfile = {
    id: profileId,
    username: profile.username ?? '',
    email: profile.email ?? '',
    displayName: profile.displayName || undefined,
    profilePictureUrl: pictureUrl,
    balance: profile.balance ?? 0,
    trustScore: profile.trustScore ?? 5.0,
    totalBets: profile.totalBets ?? 0,
    totalWinnings: profile.totalWinnings ?? 0,
    winRate: profile.winRate ?? 0,
    createdAt: profile.createdAt ?? new Date().toISOString(),
    updatedAt: profile.updatedAt ?? new Date().toISOString(),
  };

  const membership = membershipState(profile);

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
              // A gold ring marks Pro members
              style={[styles.avatarContainer, membership === 'pro' && styles.avatarRingPro]}
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
              <TouchableOpacity
                style={styles.nameRow}
                onPress={handleEditProfile}
                activeOpacity={0.7}
                testID="account-edit-name"
                accessibilityRole="button"
                accessibilityLabel="Edit display name"
              >
                <Text style={styles.displayName} numberOfLines={1}>
                  {userProfile.displayName || 'Set Display Name'}
                </Text>
                <Ionicons name="pencil" size={14} color={colors.textMuted} style={styles.nameEditIcon} />
              </TouchableOpacity>

              <View style={styles.chipRow}>
                <View style={styles.trustChip}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
                  <Text style={styles.trustChipText}>Trust {userProfile.trustScore.toFixed(1)}/10</Text>
                </View>

                {/* Membership: the way into the subscription screen (no separate menu row) */}
                {membership === 'pro' && (
                  <TouchableOpacity
                    style={[styles.membershipChip, styles.membershipChipPro]}
                    onPress={openSubscription}
                    activeOpacity={0.7}
                    testID="account-membership-pro"
                    accessibilityRole="button"
                    accessibilityLabel="Pro membership, no fees. Manage membership"
                  >
                    <Ionicons name="star" size={12} color={colors.background} />
                    <Text style={styles.membershipChipProText}>PRO · 0% fees</Text>
                  </TouchableOpacity>
                )}
                {membership === 'payment_issue' && (
                  <TouchableOpacity
                    style={[styles.membershipChip, styles.membershipChipIssue]}
                    onPress={openSubscription}
                    activeOpacity={0.7}
                    testID="account-membership-issue"
                    accessibilityRole="button"
                    accessibilityLabel="Pro payment failed. Update your card"
                  >
                    <Ionicons name="alert-circle" size={12} color={colors.warning} />
                    <Text style={styles.membershipChipIssueText}>Pro payment failed</Text>
                  </TouchableOpacity>
                )}
                {membership === 'free' && (
                  <TouchableOpacity
                    style={[styles.membershipChip, styles.membershipChipFree]}
                    onPress={openSubscription}
                    activeOpacity={0.7}
                    testID="account-membership-upgrade"
                    accessibilityRole="button"
                    accessibilityLabel="Upgrade to Pro"
                  >
                    <Ionicons name="star-outline" size={12} color={colors.primary} />
                    <Text style={styles.membershipChipFreeText}>Upgrade to Pro</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Wallet card */}
        <View style={styles.walletCard} testID="account-wallet-card">
          <TouchableOpacity
            style={styles.walletSummary}
            onPress={() => openWallet()}
            activeOpacity={0.7}
            testID="account-wallet-open"
          >
            <View>
              <Text style={styles.walletLabel}>Available</Text>
              <Text style={styles.walletBalance} testID="account-balance">
                ${userProfile.balance.toFixed(2)}
              </Text>
              {pendingPayouts > 0 && (
                <Text style={styles.walletPending}>
                  <Text testID="account-pending-payouts">${pendingPayouts.toFixed(2)}</Text> pending payouts
                </Text>
              )}
            </View>
            <View style={styles.walletLink}>
              <Text style={styles.walletLinkText}>Activity</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={styles.walletActions}>
            <TouchableOpacity
              style={[styles.walletButton, styles.walletButtonPrimary]}
              onPress={() => openWallet('addFunds')}
              activeOpacity={0.8}
              testID="account-add-funds"
            >
              <Ionicons name="add" size={18} color={colors.background} />
              <Text style={styles.walletButtonPrimaryText}>Add funds</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.walletButton, styles.walletButtonSecondary]}
              onPress={() => openWallet('withdraw')}
              activeOpacity={0.8}
              testID="account-withdraw"
            >
              <Ionicons name="arrow-up" size={18} color={colors.textPrimary} />
              <Text style={styles.walletButtonSecondaryText}>Withdraw</Text>
            </TouchableOpacity>
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
            onPress={() => navigation.navigate('Friends')}
            testID="account-friends"
          />
          <MenuOption
            icon="wallet-outline"
            title="Wallet"
            subtitle="Balance, deposits, withdrawals and activity"
            onPress={() => openWallet()}
            testID="account-wallet"
          />
          <MenuOption
            icon="settings-outline"
            title="Settings"
            subtitle="Notifications, privacy, account and security"
            onPress={() => navigation.navigate('Settings')}
            testID="account-settings"
          />
          <MenuOption
            icon="help-circle-outline"
            title="Help & About"
            subtitle="Feedback, FAQ, legal and app version"
            onPress={() => navigation.navigate('Help')}
            testID="account-help"
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  displayName: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    flexShrink: 1,
  },
  nameEditIcon: {
    marginLeft: spacing.xs,
  },
  avatarRingPro: {
    // The ring sits outside the 60px avatar; the padding is the gap between them
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 34,
    padding: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  membershipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    marginLeft: spacing.xs,
    borderWidth: 1,
  },
  membershipChipPro: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  membershipChipProText: {
    ...textStyles.caption,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.xs,
    includeFontPadding: false,
  },
  membershipChipIssue: {
    backgroundColor: colors.warning + '20',
    borderColor: colors.warning,
  },
  membershipChipIssueText: {
    ...textStyles.caption,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
    includeFontPadding: false,
  },
  membershipChipFree: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
  },
  membershipChipFreeText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
    includeFontPadding: false,
  },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '20',
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  trustChipText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
    includeFontPadding: false,
  },

  // Wallet card
  walletCard: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  walletSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  walletBalance: {
    ...textStyles.balance,
    color: colors.textPrimary,
  },
  walletPending: {
    ...textStyles.caption,
    color: colors.warning,
    marginTop: spacing.xs / 2,
  },
  walletLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletLinkText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginRight: spacing.xs / 2,
  },
  walletActions: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  walletButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  walletButtonPrimary: {
    backgroundColor: colors.primary,
    marginRight: spacing.xs,
  },
  walletButtonSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: spacing.xs,
  },
  walletButtonPrimaryText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
  },
  walletButtonSecondaryText: {
    ...textStyles.button,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
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
