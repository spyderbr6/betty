/**
 * A horizontal row of friends to tap: friends at your game first. Used for invitations
 * and, with one pick, for choosing who to challenge.
 */

import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { User } from '../../types/betting';
import { friendName, initials } from '../../services/createBetFlowLogic';

interface AvatarProps {
  name: string;
  pictureUrl?: string;
  selected?: boolean;
  size?: number;
}

export const Avatar: React.FC<AvatarProps> = ({ name, pictureUrl, selected, size = spacing[11] }) => (
  <View style={{ width: size, height: size }}>
    {pictureUrl ? (
      <Image source={{ uri: pictureUrl }} style={[styles.circle, { width: size, height: size }]} />
    ) : (
      <View style={[styles.circle, styles.placeholder, { width: size, height: size }, selected && styles.placeholderSelected]}>
        <Text style={[styles.initials, selected && styles.initialsSelected]}>{initials(name)}</Text>
      </View>
    )}
    {selected && (
      <View style={styles.check}>
        <Text style={styles.checkText}>✓</Text>
      </View>
    )}
  </View>
);

interface FriendAvatarsProps {
  friends: User[];
  selected: Set<string>;
  atGame: Set<string>;
  onToggle: (friendId: string) => void;
  testIDPrefix: string;
}

export const FriendAvatars: React.FC<FriendAvatarsProps> = ({ friends, selected, atGame, onToggle, testIDPrefix }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {friends.map((friend) => {
      const isSelected = selected.has(friend.id);
      const name = friendName(friend);
      return (
        <TouchableOpacity
          key={friend.id}
          testID={`${testIDPrefix}-${friend.id}`}
          style={styles.friend}
          onPress={() => onToggle(friend.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={`${name}${atGame.has(friend.id) ? ', at the game' : ''}`}
        >
          <Avatar name={name} pictureUrl={friend.profilePictureUrl} selected={isSelected} />
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  friend: {
    width: spacing[16],
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  circle: {
    borderRadius: spacing.radius.full,
  },
  placeholder: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  initials: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  initialsSelected: {
    color: colors.textPrimary,
  },
  check: {
    position: 'absolute',
    right: -spacing.xs / 2,
    bottom: -spacing.xs / 2,
    width: spacing[5],
    height: spacing[5],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    ...textStyles.caption,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  name: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
