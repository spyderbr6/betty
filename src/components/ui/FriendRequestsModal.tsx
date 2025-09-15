/**
 * Friend Requests Modal Component
 * Shows incoming friend requests with accept/decline functionality
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
import { colors, spacing, typography, textStyles, commonStyles } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types/betting';

// Initialize GraphQL client
const client = generateClient<Schema>();

interface FriendRequestsModalProps {
  visible: boolean;
  onClose: () => void;
  onRequestHandled?: () => void;
}

interface FriendRequestWithUser {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
  fromUser: User;
}

export const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({
  visible,
  onClose,
  onRequestHandled,
}) => {
  const { user } = useAuth();
  const [friendRequests, setFriendRequests] = useState<FriendRequestWithUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  // Fetch friend requests when modal opens
  useEffect(() => {
    if (visible && user?.userId) {
      fetchFriendRequests();
    }
  }, [visible, user?.userId]);

  const fetchFriendRequests = async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);

      // Get pending friend requests to current user
      const { data: requests } = await client.models.FriendRequest.list({
        filter: {
          toUserId: { eq: user.userId },
          status: { eq: 'PENDING' }
        },
      });

      if (!requests || requests.length === 0) {
        setFriendRequests([]);
        return;
      }

      // Fetch user details for each request sender
      const requestsWithUsers = await Promise.all(
        requests.map(async (request) => {
          try {
            const { data: fromUser } = await client.models.User.get({ id: request.fromUserId });

            if (fromUser) {
              return {
                id: request.id!,
                fromUserId: request.fromUserId!,
                toUserId: request.toUserId!,
                status: request.status!,
                createdAt: request.createdAt || new Date().toISOString(),
                fromUser: {
                  id: fromUser.id!,
                  username: fromUser.username!,
                  email: fromUser.email!,
                  displayName: fromUser.displayName || undefined,
                  profilePictureUrl: fromUser.profilePictureUrl || undefined,
                  balance: fromUser.balance || 0,
                  trustScore: fromUser.trustScore || 5.0,
                  totalBets: fromUser.totalBets || 0,
                  totalWinnings: fromUser.totalWinnings || 0,
                  winRate: fromUser.winRate || 0,
                  createdAt: fromUser.createdAt || new Date().toISOString(),
                  updatedAt: fromUser.updatedAt || new Date().toISOString(),
                }
              };
            }
            return null;
          } catch (error) {
            console.error(`Error fetching user ${request.fromUserId}:`, error);
            return null;
          }
        })
      );

      const validRequests = requestsWithUsers.filter((req): req is FriendRequestWithUser => req !== null);
      setFriendRequests(validRequests);
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      Alert.alert('Error', 'Failed to load friend requests. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const acceptFriendRequest = async (request: FriendRequestWithUser) => {
    if (!user?.userId) return;

    try {
      setProcessingRequests(prev => new Set(prev).add(request.id));

      // Update the friend request status to ACCEPTED
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'ACCEPTED'
      });

      // Create bilateral friendship using lexicographic ordering
      const user1Id = user.userId < request.fromUserId ? user.userId : request.fromUserId;
      const user2Id = user.userId < request.fromUserId ? request.fromUserId : user.userId;

      await client.models.Friendship.create({
        user1Id,
        user2Id,
      });

      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.id !== request.id));

      onRequestHandled?.();
      Alert.alert('Success', `You are now friends with ${request.fromUser.displayName || request.fromUser.email}!`);
    } catch (error) {
      console.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(request.id);
        return newSet;
      });
    }
  };

  const declineFriendRequest = async (request: FriendRequestWithUser) => {
    try {
      setProcessingRequests(prev => new Set(prev).add(request.id));

      // Update the friend request status to DECLINED
      await client.models.FriendRequest.update({
        id: request.id,
        status: 'DECLINED'
      });

      // Remove from local state
      setFriendRequests(prev => prev.filter(req => req.id !== request.id));

      onRequestHandled?.();
      Alert.alert('Request Declined', `Friend request from ${request.fromUser.displayName || request.fromUser.email} has been declined.`);
    } catch (error) {
      console.error('Error declining friend request:', error);
      Alert.alert('Error', 'Failed to decline friend request. Please try again.');
    } finally {
      setProcessingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(request.id);
        return newSet;
      });
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

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString();
  };

  const renderFriendRequest = ({ item }: { item: FriendRequestWithUser }) => {
    const isProcessing = processingRequests.has(item.id);

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestInfo}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.fromUser.profilePictureUrl ? (
              <Image source={{ uri: item.fromUser.profilePictureUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{generateAvatarInitials(item.fromUser)}</Text>
              </View>
            )}
          </View>

          {/* User Details */}
          <View style={styles.userDetails}>
            <Text style={styles.userName}>
              {item.fromUser.displayName || item.fromUser.email.split('@')[0]}
            </Text>
            <Text style={styles.userEmail}>{item.fromUser.email}</Text>
            <View style={styles.requestMeta}>
              <Text style={styles.requestTime}>{formatTimeAgo(item.createdAt)}</Text>
              <Text style={styles.metaDivider}>•</Text>
              <Text style={styles.trustScore}>Trust: {item.fromUser.trustScore.toFixed(1)}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.declineButton, isProcessing && styles.buttonDisabled]}
            onPress={() => declineFriendRequest(item)}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <>
                <Ionicons name="close" size={16} color={colors.error} />
                <Text style={styles.declineButtonText}>Decline</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptButton, isProcessing && styles.buttonDisabled]}
            onPress={() => acceptFriendRequest(item)}
            disabled={isProcessing}
            activeOpacity={0.7}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={colors.background} />
                <Text style={styles.acceptButtonText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Friend Requests</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading friend requests...</Text>
            </View>
          ) : friendRequests.length > 0 ? (
            <FlatList
              data={friendRequests}
              keyExtractor={(item) => item.id}
              renderItem={renderFriendRequest}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.requestsList}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No Friend Requests</Text>
              <Text style={styles.emptyDescription}>
                You don't have any pending friend requests
              </Text>
            </View>
          )}
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
  content: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  closeButton: {
    padding: spacing.xs,
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

  // Requests List
  requestsList: {
    padding: spacing.md,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  userEmail: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  requestMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestTime: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  metaDivider: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  trustScore: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  declineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginLeft: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  declineButtonText: {
    ...textStyles.button,
    color: colors.error,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.medium,
  },
  acceptButtonText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
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
    lineHeight: 24,
  },
});