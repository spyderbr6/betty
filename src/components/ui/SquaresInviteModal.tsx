/**
 * Squares Invite Modal Component
 * Allows the game creator to invite friends to a squares game after creation.
 * Mirrors the BetInviteModal pattern adapted for squares.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { colors, spacing, typography, textStyles } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { User, FriendListItem } from '../../types/betting';
import { ModalHeader } from './ModalHeader';
import { getProfilePictureUrl } from '../../services/imageUploadService';
import { showAlert } from './CustomAlert';

const client = generateClient<Schema>();

interface SquaresInviteModalProps {
  visible: boolean;
  onClose: () => void;
  game: any; // SquaresGame object
  onInvitesSent?: (count: number) => void;
}

interface InvitableFriend extends FriendListItem {
  isInvited: boolean;
  hasPendingInvite: boolean;
  hasSquares: boolean;
}

export const SquaresInviteModal: React.FC<SquaresInviteModalProps> = ({
  visible,
  onClose,
  game,
  onInvitesSent,
}) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingInvites, setSendingInvites] = useState<Set<string>>(new Set());
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible && user?.userId) {
      setSelectedFriends(new Set());
      fetchInvitableFriends();
    } else {
      setFriends([]);
      setIsLoading(true);
    }
  }, [visible, user?.userId]);

  const fetchInvitableFriends = async () => {
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

      const allFriendships = [
        ...(friendships1.data || []),
        ...(friendships2.data || [])
      ];

      if (allFriendships.length === 0) {
        setFriends([]);
        return;
      }

      // Get friend user IDs
      const friendUserIds = allFriendships.map(friendship =>
        friendship.user1Id === user.userId
          ? friendship.user2Id
          : friendship.user1Id
      ).filter(Boolean);

      // Fetch friend details, existing invitations, and purchases in parallel
      const [friendUsers, existingInvitations, gamePurchases] = await Promise.all([
        Promise.all(
          friendUserIds.map(async (friendId) => {
            try {
              const { data: friendUser } = await client.models.User.get({ id: friendId! });
              return friendUser;
            } catch (error) {
              console.error(`Error fetching friend ${friendId}:`, error);
              return null;
            }
          })
        ),
        client.models.SquaresInvitation.squaresInvitationsByGame({
          squaresGameId: game.id,
        }),
        client.models.SquaresPurchase.purchasesBySquaresGame({
          squaresGameId: game.id,
        })
      ]);

      // Build lookup sets
      const pendingInviteUserIds = new Set(
        (existingInvitations.data || [])
          .filter(inv => inv.status === 'PENDING')
          .map(inv => inv.toUserId)
      );
      const purchaserUserIds = new Set(
        (gamePurchases.data || []).map(p => p.userId)
      );

      // Build InvitableFriend objects
      const invitableFriends: InvitableFriend[] = await Promise.all(
        friendUsers
          .filter((friendUser): friendUser is NonNullable<typeof friendUser> => friendUser !== null)
          .map(async (friendUser, index) => {
            const friendship = allFriendships[index];

            let profilePictureUrl = undefined;
            if (friendUser.profilePictureUrl) {
              const signedUrl = await getProfilePictureUrl(friendUser.profilePictureUrl);
              profilePictureUrl = signedUrl || undefined;
            }

            return {
              user: {
                id: friendUser.id || '',
                username: friendUser.username || '',
                email: friendUser.email || '',
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
                id: friendship.id || '',
                user1Id: friendship.user1Id || '',
                user2Id: friendship.user2Id || '',
                createdAt: friendship.createdAt || new Date().toISOString(),
              },
              mutualFriends: 0,
              lastBetTogether: undefined,
              isInvited: false,
              hasPendingInvite: pendingInviteUserIds.has(friendUser.id || ''),
              hasSquares: purchaserUserIds.has(friendUser.id || ''),
            };
          })
      );

      setFriends(invitableFriends);
    } catch (error) {
      console.error('Error fetching invitable friends:', error);
      showAlert('Error', 'Failed to load friends. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => {
      const newSet = new Set(prev);
      if (newSet.has(friendId)) {
        newSet.delete(friendId);
      } else {
        newSet.add(friendId);
      }
      return newSet;
    });
  };

  const sendInvitations = async () => {
    if (selectedFriends.size === 0) {
      showAlert('No Friends Selected', 'Please select at least one friend to invite.');
      return;
    }

    if (!user?.userId) return;

    try {
      setSendingInvites(new Set(selectedFriends));

      const selectedFriendsList = friends.filter(f => selectedFriends.has(f.user.id));

      // Get current user's display name
      const { data: currentUserData } = await client.models.User.get({ id: user.userId });
      const currentUserDisplayName = currentUserData?.displayName || currentUserData?.username || user.username;

      const invitationPromises = selectedFriendsList.map(async (friend) => {
        try {
          // Create squares invitation — expires when the grid locks
          await client.models.SquaresInvitation.create({
            squaresGameId: game.id,
            fromUserId: user.userId,
            toUserId: friend.user.id,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: game.locksAt || undefined,
          });

          // Send notification
          await client.models.Notification.create({
            userId: friend.user.id,
            type: 'SQUARES_INVITATION_RECEIVED',
            title: 'Squares Game Invitation',
            message: `${currentUserDisplayName} invited you to join their squares game!`,
            priority: 'HIGH',
            isRead: false,
            actionData: JSON.stringify({ squaresGameId: game.id }),
            createdAt: new Date().toISOString(),
          });

          return true;
        } catch (error) {
          console.error(`Error inviting friend ${friend.user.id}:`, error);
          return false;
        }
      });

      const results = await Promise.all(invitationPromises);
      const successCount = results.filter(Boolean).length;

      if (successCount > 0) {
        onInvitesSent?.(successCount);
        onClose();
        showAlert(
          'Invitations Sent!',
          `Successfully sent ${successCount} invitation${successCount > 1 ? 's' : ''} to your friends.`
        );
      } else {
        showAlert('Error', 'Failed to send invitations. Please try again.');
      }
    } catch (error) {
      console.error('Error sending invitations:', error);
      showAlert('Error', 'Failed to send invitations. Please try again.');
    } finally {
      setSendingInvites(new Set());
    }
  };

  const generateAvatarInitials = (u: User) => {
    const nameForAvatar = u.displayName || u.username || u.email?.split('@')[0] || 'U';
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  const renderFriend = ({ item }: { item: InvitableFriend }) => {
    const isSelected = selectedFriends.has(item.user.id);
    const canInvite = !item.hasPendingInvite && !item.hasSquares;

    return (
      <TouchableOpacity
        style={[
          styles.friendItem,
          isSelected && styles.friendItemSelected,
          !canInvite && styles.friendItemDisabled
        ]}
        onPress={() => canInvite && toggleFriendSelection(item.user.id)}
        disabled={!canInvite}
        activeOpacity={0.7}
      >
        <View style={styles.friendInfo}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.user.profilePictureUrl ? (
              <Image source={{ uri: item.user.profilePictureUrl }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{generateAvatarInitials(item.user)}</Text>
              </View>
            )}
            {isSelected && (
              <View style={styles.selectedBadge}>
                <Ionicons name="checkmark" size={12} color={colors.background} />
              </View>
            )}
          </View>

          {/* Friend Details */}
          <View style={styles.friendDetails}>
            <Text style={styles.friendName}>
              {item.user.displayName || item.user.username || item.user.email?.split('@')[0] || 'Unknown'}
            </Text>
            <Text style={styles.friendEmail}>{item.user.email || ''}</Text>
            {item.hasSquares && (
              <Text style={styles.friendStatusText}>Already has squares</Text>
            )}
            {item.hasPendingInvite && (
              <Text style={styles.friendStatusText}>Invitation pending</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Invite Friends" onClose={onClose} />

        {/* Game Info Card */}
        <View style={styles.gameInfoCard}>
          <View style={styles.gameCardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: colors.success }]}>
              <Text style={styles.statusText}>{game.status}</Text>
            </View>
            <View style={styles.potContainer}>
              <Text style={styles.potAmount}>
                ${game.totalPot || 0}
              </Text>
              <Text style={styles.potLabel}>POT</Text>
            </View>
          </View>
          <Text style={styles.gameTitle}>{game.title}</Text>
          <Text style={styles.gameSubtitle}>
            {game.squaresSold}/100 squares sold · ${game.pricePerSquare}/sq
          </Text>
        </View>

        {/* Friends List */}
        <View style={styles.friendsSection}>
          <Text style={styles.sectionTitle}>
            Select Friends ({selectedFriends.size} selected)
          </Text>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading friends...</Text>
            </View>
          ) : friends.length > 0 ? (
            <FlatList
              data={friends}
              keyExtractor={(item) => item.user.id}
              renderItem={renderFriend}
              showsVerticalScrollIndicator={false}
              style={styles.friendsList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Friends Available</Text>
              <Text style={styles.emptyDescription}>
                Add friends to invite them to your squares game
              </Text>
            </View>
          )}
        </View>

        {/* Send Button */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (selectedFriends.size === 0 || sendingInvites.size > 0) && styles.sendButtonDisabled
            ]}
            onPress={sendInvitations}
            disabled={selectedFriends.size === 0 || sendingInvites.size > 0}
            activeOpacity={0.7}
          >
            {sendingInvites.size > 0 ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={colors.background} />
                <Text style={styles.sendButtonText}>
                  Send Invitations ({selectedFriends.size})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Game Info Card
  gameInfoCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.sm,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  gameCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  potContainer: {
    alignItems: 'flex-end',
  },
  potAmount: {
    ...textStyles.pot,
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize.xl * 1.2,
  },
  potLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: typography.fontWeight.medium,
    marginTop: -2,
  },
  gameTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontSize: typography.fontSize.lg,
  },
  gameSubtitle: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },

  // Section Title
  sectionTitle: {
    ...textStyles.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.semibold,
  },

  // Friends Section
  friendsSection: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  friendsList: {
    flex: 1,
  },
  friendItem: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  friendItemSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  friendItemDisabled: {
    opacity: 0.5,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...textStyles.caption,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  selectedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
  },
  friendStatusText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs / 2,
  },

  // Loading and Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Action Container
  actionContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
    opacity: 0.6,
  },
  sendButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontSize: 13,
    fontWeight: typography.fontWeight.bold,
  },
});
