/**
 * Friends Screen
 * Display and manage user's friends list with add friend functionality
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, typography, commonStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { ModalHeader } from '../components/ui/ModalHeader';
import { AddFriendModal } from '../components/ui/AddFriendModal';
import { FriendRequestsModal } from '../components/ui/FriendRequestsModal';
import { useAuth } from '../contexts/AuthContext';
import { FriendListItem, User } from '../types/betting';
import { getProfilePictureUrl } from '../services/imageUploadService';
import { showAlert } from '../components/ui/CustomAlert';

// Initialize GraphQL client
const client = generateClient<Schema>();

interface FriendsScreenProps {
  onClose?: () => void;
}

export const FriendsScreen: React.FC<FriendsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchFriends();
    }
  }, [user]);

  const fetchFriends = async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);

      // Fetch friendships where current user is either user1 or user2
      const [friendships1, friendships2] = await Promise.all([
        client.models.Friendship.list({
          filter: { user1Id: { eq: user.userId } }
        }),
        client.models.Friendship.list({
          filter: { user2Id: { eq: user.userId } }
        })
      ]);

      // Combine both friendship arrays
      const allFriendships = [
        ...(friendships1.data || []),
        ...(friendships2.data || [])
      ];

      // Get friend user IDs (the other user in each friendship)
      const friendUserIds = allFriendships.map(friendship =>
        friendship.user1Id === user.userId
          ? friendship.user2Id
          : friendship.user1Id
      ).filter(Boolean);

      // Fetch friend user details
      const friendUsers = await Promise.all(
        friendUserIds.map(async (friendId) => {
          try {
            const { data: friendUser } = await client.models.User.get({ id: friendId! });
            return friendUser;
          } catch (error) {
            console.error(`Error fetching friend ${friendId}:`, error);
            return null;
          }
        })
      );

      // Create FriendListItem objects with fresh signed URLs for profile pictures
      const friendListItems: FriendListItem[] = await Promise.all(
        friendUsers
          .filter((friendUser): friendUser is NonNullable<typeof friendUser> => friendUser !== null)
          .map(async (friendUser, index) => {
            const friendship = allFriendships[index];

            // Get fresh signed URL for profile picture if it exists
            let profilePictureUrl = undefined;
            if (friendUser.profilePictureUrl) {
              const signedUrl = await getProfilePictureUrl(friendUser.profilePictureUrl);
              profilePictureUrl = signedUrl || undefined;
            }

            return {
              user: {
                id: friendUser.id!,
                username: friendUser.username!,
                email: friendUser.email!,
                displayName: friendUser.displayName || undefined,
                profilePictureUrl: profilePictureUrl,
                balance: friendUser.balance || 0,
                trustScore: friendUser.trustScore || 5.0,
                totalBets: friendUser.totalBets || 0,
                totalWinnings: friendUser.totalWinnings || 0,
                winRate: friendUser.winRate || 0,
                createdAt: friendUser.createdAt || new Date().toISOString(),
                updatedAt: friendUser.updatedAt || new Date().toISOString(),
              },
              friendship: {
                id: friendship.id!,
                user1Id: friendship.user1Id!,
                user2Id: friendship.user2Id!,
                createdAt: friendship.createdAt || new Date().toISOString(),
              },
              mutualFriends: 0, // TODO: Calculate mutual friends
              lastBetTogether: undefined, // TODO: Find last bet together
            };
          })
      );

      setFriends(friendListItems);
    } catch (error) {
      console.error('Error fetching friends:', error);
      showAlert('Error', 'Failed to load friends. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchFriends();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddFriend = () => {
    setShowAddFriendModal(true);
  };

  const handleAddFriendModalClose = () => {
    setShowAddFriendModal(false);
  };

  const handleFriendRequestSent = () => {
    // Optionally refresh friends list or show success message
    console.log('Friend request sent successfully');
  };

  const handleViewRequests = () => {
    setShowFriendRequestsModal(true);
  };

  const handleFriendRequestsModalClose = () => {
    setShowFriendRequestsModal(false);
  };

  const handleRequestHandled = () => {
    // Refresh friends list when a request is accepted
    fetchFriends();
  };

  const handleFriendPress = (friend: FriendListItem) => {
    console.log('Friend pressed:', friend.user.displayName);
    // TODO: Open friend profile or actions
  };

  const handleRemoveFriend = (friend: FriendListItem) => {
    showAlert(
      'Remove Friend',
      `Are you sure you want to remove ${friend.user.displayName || friend.user.username} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeFriend(friend),
        },
      ]
    );
  };

  const removeFriend = async (friend: FriendListItem) => {
    try {
      await client.models.Friendship.delete({ id: friend.friendship.id });
      setFriends(friends.filter(f => f.friendship.id !== friend.friendship.id));
      showAlert('Success', 'Friend removed successfully.');
    } catch (error) {
      console.error('Error removing friend:', error);
      showAlert('Error', 'Failed to remove friend. Please try again.');
    }
  };

  const generateAvatarInitials = (user: User) => {
    const nameForAvatar = user.displayName || user.username || user.email.split('@')[0];
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {onClose ? (
          <ModalHeader
            title="Friends"
            onClose={onClose}
            rightComponent={
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddFriend}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add" size={20} color={colors.primary} />
              </TouchableOpacity>
            }
          />
        ) : (
          <Header title="Friends" />
        )}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your friends...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {onClose ? (
        <ModalHeader
          title="Friends"
          onClose={onClose}
          rightComponent={
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddFriend}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add" size={20} color={colors.primary} />
            </TouchableOpacity>
          }
        />
      ) : (
        <Header title="Friends" />
      )}

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
        {/* Friends Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerInfo}>
            <Text style={styles.friendsCount}>{friends.length}</Text>
            <Text style={styles.friendsLabel}>Friends</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.requestsButton}
              onPress={handleViewRequests}
              activeOpacity={0.7}
            >
              <Ionicons name="mail-outline" size={20} color={colors.primary} />
              <Text style={styles.requestsButtonText}>Requests</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addFriendButton}
              onPress={handleAddFriend}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add" size={20} color={colors.background} />
              <Text style={styles.addFriendText}>Add Friend</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Friends List */}
        {friends.length > 0 ? (
          <View style={styles.friendsList}>
            {friends.map((friend) => (
              <FriendCard
                key={friend.friendship.id}
                friend={friend}
                onPress={() => handleFriendPress(friend)}
                onRemove={() => handleRemoveFriend(friend)}
                generateInitials={generateAvatarInitials}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Friends Yet</Text>
            <Text style={styles.emptyDescription}>
              Start building your betting network by adding friends!
            </Text>
            <TouchableOpacity
              style={styles.emptyAddButton}
              onPress={handleAddFriend}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyAddButtonText}>Add Your First Friend</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add Friend Modal */}
      <AddFriendModal
        visible={showAddFriendModal}
        onClose={handleAddFriendModalClose}
        onRequestSent={handleFriendRequestSent}
      />

      {/* Friend Requests Modal */}
      <FriendRequestsModal
        visible={showFriendRequestsModal}
        onClose={handleFriendRequestsModalClose}
        onRequestHandled={handleRequestHandled}
      />
    </SafeAreaView>
  );
};

// Friend Card Component
interface FriendCardProps {
  friend: FriendListItem;
  onPress: () => void;
  onRemove: () => void;
  generateInitials: (user: User) => string;
}

const FriendCard: React.FC<FriendCardProps> = ({
  friend,
  onPress,
  onRemove,
  generateInitials,
}) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <TouchableOpacity
      style={styles.friendCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.friendInfo}>
        {/* Friend Avatar */}
        <View style={styles.avatarContainer}>
          {friend.user.profilePictureUrl ? (
            <Image
              source={{ uri: friend.user.profilePictureUrl }}
              style={styles.friendAvatar}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.friendAvatarPlaceholder}>
              <Text style={styles.friendAvatarText}>
                {generateInitials(friend.user)}
              </Text>
            </View>
          )}
          {/* Online indicator placeholder */}
          <View style={styles.onlineIndicator} />
        </View>

        {/* Friend Details */}
        <View style={styles.friendDetails}>
          <Text style={styles.friendName}>
            {friend.user.displayName || friend.user.username}
          </Text>
          <Text style={styles.friendEmail}>{friend.user.email}</Text>
          <View style={styles.friendStats}>
            <Text style={styles.friendStat}>
              Trust: {friend.user.trustScore.toFixed(1)}
            </Text>
            <Text style={styles.friendStatDivider}>•</Text>
            <Text style={styles.friendStat}>
              {friend.user.totalBets} bets
            </Text>
          </View>
        </View>
      </View>

      {/* Friend Actions */}
      <TouchableOpacity
        style={styles.friendActions}
        onPress={() => setShowActions(!showActions)}
        activeOpacity={0.7}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Action Menu (when expanded) */}
      {showActions && (
        <View style={styles.actionMenu}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => {
              setShowActions(false);
              console.log('Invite to bet');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="dice-outline" size={18} color={colors.primary} />
            <Text style={styles.actionText}>Invite to Bet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionItem, styles.dangerAction]}
            onPress={() => {
              setShowActions(false);
              onRemove();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-remove-outline" size={18} color={colors.error} />
            <Text style={[styles.actionText, styles.dangerActionText]}>Remove Friend</Text>
          </TouchableOpacity>
        </View>
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

  // Loading State
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

  // Modal Header Action Button
  addButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },

  // Header Section
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    alignItems: 'center',
  },
  friendsCount: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  friendsLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.sm,
  },
  requestsButtonText: {
    ...textStyles.caption,
    color: colors.primary,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  addFriendText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // Friends List
  friendsList: {
    padding: spacing.md,
  },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  friendInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  friendAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  friendAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  friendDetails: {
    flex: 1,
  },
  friendName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  friendEmail: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  friendStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendStat: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  friendStatDivider: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  friendActions: {
    padding: spacing.xs,
  },

  // Action Menu
  actionMenu: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
    minWidth: 150,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dangerAction: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionText: {
    ...textStyles.body,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  dangerActionText: {
    color: colors.error,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  emptyAddButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
  },
  emptyAddButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
});