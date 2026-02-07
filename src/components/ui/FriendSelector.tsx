/**
 * FriendSelector Component
 * Reusable friend selection UI for invitations
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, textStyles, spacing, typography } from '../../styles';
import { User } from '../../types/betting';

interface FriendSelectorProps {
  friends: User[];
  selectedFriends: Set<string>;
  onToggleFriend: (friendId: string) => void;
  maxDisplay?: number;
  label?: string;
  sublabel?: string;
}

export const FriendSelector: React.FC<FriendSelectorProps> = ({
  friends,
  selectedFriends,
  onToggleFriend,
  maxDisplay = 10, // Show up to 10 friends
  label = 'INVITE FRIENDS',
  sublabel = 'Select friends to invite',
}) => {
  const generateAvatarInitials = (friend: User): string => {
    const nameForAvatar = friend.displayName || friend.username || friend.email.split('@')[0];
    return nameForAvatar
      .split(/[\s_.]/)
      .map(part => part[0]?.toUpperCase())
      .filter(Boolean)
      .join('')
      .slice(0, 2) || '??';
  };

  const displayedFriends = friends.slice(0, maxDisplay);

  if (friends.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <Text style={styles.sectionSubtitle}>{sublabel}</Text>
        <View style={styles.noFriendsContainer}>
          <Ionicons name="people-outline" size={32} color={colors.textMuted} />
          <Text style={styles.noFriendsText}>No friends to invite</Text>
          <Text style={styles.noFriendsSubtext}>Add friends to invite them</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{label}</Text>
      <Text style={styles.sectionSubtitle}>{sublabel}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.friendsScroll}
        contentContainerStyle={styles.friendsScrollContent}
      >
        {displayedFriends.map((friend) => (
          <TouchableOpacity
            key={friend.id}
            style={[
              styles.friendAvatar,
              selectedFriends.has(friend.id) && styles.friendAvatarSelected
            ]}
            onPress={() => onToggleFriend(friend.id)}
            activeOpacity={0.7}
          >
            {friend.profilePictureUrl ? (
              <Image
                source={{ uri: friend.profilePictureUrl }}
                style={styles.friendImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[
                styles.friendPlaceholder,
                selectedFriends.has(friend.id) && styles.friendPlaceholderSelected
              ]}>
                <Text style={[
                  styles.friendInitials,
                  selectedFriends.has(friend.id) && styles.friendInitialsSelected
                ]}>
                  {generateAvatarInitials(friend)}
                </Text>
              </View>
            )}
            {selectedFriends.has(friend.id) && (
              <View style={styles.friendSelectedBadge}>
                <Ionicons name="checkmark" size={12} color={colors.background} />
              </View>
            )}
            <Text style={styles.friendName} numberOfLines={1}>
              {friend.displayName || friend.username || friend.email.split('@')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedFriends.size > 0 && (
        <View style={styles.selectedFriendsInfo}>
          <Ionicons name="people" size={16} color={colors.primary} />
          <Text style={styles.selectedFriendsText}>
            {selectedFriends.size} friend{selectedFriends.size !== 1 ? 's' : ''} selected
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontWeight: typography.fontWeight.bold,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  friendsScroll: {
    marginTop: spacing.md,
  },
  friendsScrollContent: {
    paddingRight: spacing.md,
  },
  friendAvatar: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 60,
  },
  friendAvatarSelected: {
    // Handled by badge
  },
  friendImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.border,
  },
  friendPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  friendPlaceholderSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
  },
  friendInitials: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
    fontSize: 14,
  },
  friendInitialsSelected: {
    color: colors.background,
  },
  friendSelectedBadge: {
    position: 'absolute',
    top: -2,
    right: 5,
    backgroundColor: colors.success,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  friendName: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    maxWidth: 60,
  },
  selectedFriendsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
  },
  selectedFriendsText: {
    ...textStyles.caption,
    color: colors.primary,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
  },
  noFriendsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    marginTop: spacing.md,
  },
  noFriendsText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  noFriendsSubtext: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
});
