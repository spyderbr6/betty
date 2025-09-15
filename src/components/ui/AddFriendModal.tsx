/**
 * Add Friend Modal Component
 * Allows users to search for and send friend requests to other users
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { colors, spacing, typography, textStyles, commonStyles } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types/betting';
import { NotificationService } from '../../services/notificationService';

// Initialize GraphQL client
const client = generateClient<Schema>();

interface AddFriendModalProps {
  visible: boolean;
  onClose: () => void;
  onRequestSent?: () => void;
}

interface SearchResult extends User {
  isAlreadyFriend: boolean;
  hasPendingRequest: boolean;
  requestSent: boolean;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  visible,
  onClose,
  onRequestSent,
}) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(new Set());

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setSendingRequests(new Set());
    }
  }, [visible]);

  const searchUsers = async () => {
    if (!searchQuery.trim() || !user?.userId) return;

    try {
      setIsSearching(true);
      setHasSearched(true);

      // Search users by email or display name
      const [emailResults, nameResults] = await Promise.all([
        client.models.User.list({
          filter: {
            email: { contains: searchQuery.trim().toLowerCase() }
          },
          limit: 10,
        }),
        client.models.User.list({
          filter: {
            displayName: { contains: searchQuery.trim() }
          },
          limit: 10,
        })
      ]);

      // Combine and deduplicate results
      const allUsers = [...(emailResults.data || []), ...(nameResults.data || [])];
      const uniqueUsers = allUsers.filter((user, index, array) =>
        array.findIndex(u => u.id === user.id) === index
      );

      // Filter out current user
      const filteredUsers = uniqueUsers.filter(u => u.id !== user.userId);

      // Get existing friendships and friend requests for this user
      const [existingFriendships1, existingFriendships2, outgoingRequests, incomingRequests] = await Promise.all([
        client.models.Friendship.list({
          filter: { user1Id: { eq: user.userId } }
        }),
        client.models.Friendship.list({
          filter: { user2Id: { eq: user.userId } }
        }),
        client.models.FriendRequest.list({
          filter: {
            fromUserId: { eq: user.userId },
            status: { eq: 'PENDING' }
          }
        }),
        client.models.FriendRequest.list({
          filter: {
            toUserId: { eq: user.userId },
            status: { eq: 'PENDING' }
          }
        })
      ]);

      // Create sets for faster lookup
      const friendIds = new Set([
        ...(existingFriendships1.data || []).map(f => f.user2Id),
        ...(existingFriendships2.data || []).map(f => f.user1Id),
      ]);

      const pendingOutgoingIds = new Set((outgoingRequests.data || []).map(r => r.toUserId));
      const pendingIncomingIds = new Set((incomingRequests.data || []).map(r => r.fromUserId));

      // Map users with relationship status
      const resultsWithStatus: SearchResult[] = filteredUsers.map(foundUser => ({
        id: foundUser.id!,
        username: foundUser.username!,
        email: foundUser.email!,
        displayName: foundUser.displayName || undefined,
        profilePictureUrl: foundUser.profilePictureUrl || undefined,
        balance: foundUser.balance || 0,
        trustScore: foundUser.trustScore || 5.0,
        totalBets: foundUser.totalBets || 0,
        totalWinnings: foundUser.totalWinnings || 0,
        winRate: foundUser.winRate || 0,
        createdAt: foundUser.createdAt || new Date().toISOString(),
        updatedAt: foundUser.updatedAt || new Date().toISOString(),
        isAlreadyFriend: friendIds.has(foundUser.id!),
        hasPendingRequest: pendingOutgoingIds.has(foundUser.id!) || pendingIncomingIds.has(foundUser.id!),
        requestSent: false,
      }));

      setSearchResults(resultsWithStatus);
    } catch (error) {
      console.error('Error searching users:', error);
      Alert.alert('Error', 'Failed to search users. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (targetUser: SearchResult) => {
    if (!user?.userId) return;

    try {
      setSendingRequests(prev => new Set(prev).add(targetUser.id));

      // Create friend request
      const { data: newRequest } = await client.models.FriendRequest.create({
        fromUserId: user.userId,
        toUserId: targetUser.id,
        status: 'PENDING',
      });

      // Create notification for the target user
      if (newRequest) {
        const currentUserDisplayName = user.displayName || user.username || user.email.split('@')[0];
        await NotificationService.notifyFriendRequestReceived(
          targetUser.id,
          currentUserDisplayName,
          user.userId,
          newRequest.id!
        );
      }

      // Update the user's status in search results
      setSearchResults(prev =>
        prev.map(u =>
          u.id === targetUser.id
            ? { ...u, requestSent: true, hasPendingRequest: true }
            : u
        )
      );

      onRequestSent?.();
      Alert.alert('Success', `Friend request sent to ${targetUser.displayName || targetUser.email}!`);
    } catch (error) {
      console.error('Error sending friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    } finally {
      setSendingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetUser.id);
        return newSet;
      });
    }
  };

  const generateAvatarInitials = (user: SearchResult) => {
    const nameForAvatar = user.displayName || user.username || user.email.split('@')[0];
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  const renderUserResult = ({ item }: { item: SearchResult }) => {
    const isLoading = sendingRequests.has(item.id);

    return (
      <View style={styles.userCard}>
        <View style={styles.userInfo}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {item.profilePictureUrl ? (
              <Image source={{ uri: item.profilePictureUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{generateAvatarInitials(item)}</Text>
              </View>
            )}
          </View>

          {/* User Details */}
          <View style={styles.userDetails}>
            <Text style={styles.userName}>
              {item.displayName || item.email.split('@')[0]}
            </Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            <View style={styles.userStats}>
              <Text style={styles.userStat}>Trust: {item.trustScore.toFixed(1)}</Text>
              <Text style={styles.userStatDivider}>•</Text>
              <Text style={styles.userStat}>{item.totalBets} bets</Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          {item.isAlreadyFriend ? (
            <View style={styles.statusButton}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.statusText}>Friends</Text>
            </View>
          ) : item.hasPendingRequest || item.requestSent ? (
            <View style={styles.statusButton}>
              <Ionicons name="time-outline" size={16} color={colors.warning} />
              <Text style={styles.statusText}>Pending</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, isLoading && styles.addButtonDisabled]}
              onPress={() => sendFriendRequest(item)}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Ionicons name="person-add" size={16} color={colors.background} />
                  <Text style={styles.addButtonText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Friend</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Search Section */}
          <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by email or name..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={searchUsers}
              />
              {isSearching && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>
            <TouchableOpacity
              style={[styles.searchButton, !searchQuery.trim() && styles.searchButtonDisabled]}
              onPress={searchUsers}
              disabled={!searchQuery.trim() || isSearching}
              activeOpacity={0.7}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>
          </View>

          {/* Results Section */}
          <View style={styles.resultsSection}>
            {isSearching ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Searching users...</Text>
              </View>
            ) : hasSearched ? (
              searchResults.length > 0 ? (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => item.id}
                  renderItem={renderUserResult}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.resultsList}
                />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={64} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>No Users Found</Text>
                  <Text style={styles.emptyDescription}>
                    Try searching with a different email or name
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="person-add-outline" size={64} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Find Friends</Text>
                <Text style={styles.emptyDescription}>
                  Search by email or display name to send friend requests
                </Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
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

  // Search Section
  searchSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    marginLeft: spacing.xs,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  searchButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },

  // Results Section
  resultsSection: {
    flex: 1,
  },
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
  resultsList: {
    padding: spacing.md,
  },

  // User Cards
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userStat: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  userStatDivider: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },

  // Action Buttons
  actionContainer: {
    marginLeft: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
  },
  addButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  addButtonText: {
    ...textStyles.caption,
    color: colors.background,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.medium,
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