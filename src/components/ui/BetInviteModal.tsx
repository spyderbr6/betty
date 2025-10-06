/**
 * Bet Invite Modal Component
 * Allows users to invite friends to specific bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
import { Bet, User, FriendListItem } from '../../types/betting';
import { NotificationService } from '../../services/notificationService';
import { ModalHeader } from './ModalHeader';
import { getProfilePictureUrl } from '../../services/imageUploadService';

// Initialize GraphQL client
const client = generateClient<Schema>();

interface BetInviteModalProps {
  visible: boolean;
  onClose: () => void;
  bet: Bet;
  onInvitesSent?: (count: number) => void;
}

interface InvitableFriend extends FriendListItem {
  isInvited: boolean;
  hasPendingInvite: boolean;
  isParticipating: boolean;
}

export const BetInviteModal: React.FC<BetInviteModalProps> = ({
  visible,
  onClose,
  bet,
  onInvitesSent,
}) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<InvitableFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingInvites, setSendingInvites] = useState<Set<string>>(new Set());
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());

  // Reset state when modal opens/closes
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

      // Combine both friendship arrays
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

      // Fetch friend user details, existing invitations, and participations
      const [friendUsers, existingInvitations, betParticipants] = await Promise.all([
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
        client.models.BetInvitation.list({
          filter: {
            betId: { eq: bet.id },
            status: { eq: 'PENDING' }
          }
        }),
        client.models.Participant.list({
          filter: { betId: { eq: bet.id } }
        })
      ]);

      // Create sets for faster lookup
      const pendingInviteUserIds = new Set(
        (existingInvitations.data || []).map(inv => inv.toUserId)
      );
      const participatingUserIds = new Set(
        (betParticipants.data || []).map(p => p.userId)
      );

      // Create InvitableFriend objects with fresh signed URLs for profile pictures
      const invitableFriends: InvitableFriend[] = await Promise.all(
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
              mutualFriends: 0,
              lastBetTogether: undefined,
              isInvited: false,
              hasPendingInvite: pendingInviteUserIds.has(friendUser.id!),
              isParticipating: participatingUserIds.has(friendUser.id!),
            };
          })
      );

      setFriends(invitableFriends);
    } catch (error) {
      console.error('Error fetching invitable friends:', error);
      Alert.alert('Error', 'Failed to load friends. Please try again.');
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
      Alert.alert('No Friends Selected', 'Please select at least one friend to invite.');
      return;
    }

    if (!user?.userId) return;

    try {
      setSendingInvites(new Set(selectedFriends));

      const selectedFriendsList = friends.filter(f => selectedFriends.has(f.user.id));

      // Fetch current user's display name from database
      const { data: currentUserData } = await client.models.User.get({ id: user.userId });
      const currentUserDisplayName = currentUserData?.displayName || currentUserData?.username || user.username;

      // Create invitations for all selected friends
      const invitationPromises = selectedFriendsList.map(async (friend) => {
        try {
          // Calculate expiration time (24 hours from now)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          // Create bet invitation (no side or message)
          const { data: invitation } = await client.models.BetInvitation.create({
            betId: bet.id,
            fromUserId: user.userId,
            toUserId: friend.user.id,
            status: 'PENDING',
            expiresAt: expiresAt.toISOString(),
          });

          // Send notification
          if (invitation) {
            await NotificationService.notifyBetInvitationReceived(
              friend.user.id,
              currentUserDisplayName,
              bet.title,
              user.userId,
              bet.id,
              invitation.id!
            );
          }

          return invitation;
        } catch (error) {
          console.error(`Error inviting friend ${friend.user.id}:`, error);
          return null;
        }
      });

      const results = await Promise.all(invitationPromises);
      const successCount = results.filter(r => r !== null).length;

      if (successCount > 0) {
        onInvitesSent?.(successCount);
        onClose();
        Alert.alert(
          'Invitations Sent!',
          `Successfully sent ${successCount} invitation${successCount > 1 ? 's' : ''} to your friends.`
        );
      } else {
        Alert.alert('Error', 'Failed to send invitations. Please try again.');
      }
    } catch (error) {
      console.error('Error sending invitations:', error);
      Alert.alert('Error', 'Failed to send invitations. Please try again.');
    } finally {
      setSendingInvites(new Set());
    }
  };

  const generateAvatarInitials = (user: User) => {
    const nameForAvatar = user.displayName || user.username || user.email?.split('@')[0] || 'U';
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  const renderFriend = ({ item }: { item: InvitableFriend }) => {
    const isSelected = selectedFriends.has(item.user.id);
    const canInvite = !item.hasPendingInvite && !item.isParticipating;

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
              <Image source={{ uri: item.user.profilePictureUrl }} style={styles.avatar} />
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
            {item.isParticipating && (
              <Text style={styles.statusText}>Already participating</Text>
            )}
            {item.hasPendingInvite && (
              <Text style={styles.statusText}>Invitation pending</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Standardized Modal Header */}
        <ModalHeader title="Invite Friends" onClose={onClose} />

        {/* Bet Info */}
        <View style={styles.betInfo}>
          <Text style={styles.betTitle}>{bet.title}</Text>
          <Text style={styles.betDescription} numberOfLines={2}>
            {bet.description}
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
                Add friends to invite them to bets
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

  // Bet Info
  betInfo: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  betTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  betDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
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
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
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
  statusText: {
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
    borderRadius: spacing.radius.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  sendButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});