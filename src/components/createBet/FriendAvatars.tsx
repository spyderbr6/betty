/**
 * People as the design draws them: a coloured circle with an initial (or their picture),
 * a yellow ring and check when picked, the name underneath. Used for invitations, for
 * choosing who to challenge, and as the stack of friends at the game.
 */

import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { User } from '../../types/betting';
import { friendName, initials } from '../../services/createBetFlowLogic';
import { TARGET } from './styles';

const FILLS = [colors.avatar1, colors.avatar2, colors.avatar3, colors.avatar4, colors.avatar5, colors.avatar6];

/** The same person always gets the same colour. */
const fillFor = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return FILLS[Math.abs(hash) % FILLS.length];
};

interface AvatarProps {
  name: string;
  /** Picks the fill colour; defaults to the name */
  colorKey?: string;
  pictureUrl?: string;
  selected?: boolean;
  size?: number;
  /** Overrides the fill (yourself, in yellow) */
  fill?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, colorKey, pictureUrl, selected, size = TARGET, fill }) => {
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={round}>
      {pictureUrl ? (
        <Image source={{ uri: pictureUrl }} style={[round, selected && styles.ring]} />
      ) : (
        <View style={[round, styles.placeholder, { backgroundColor: fill ?? fillFor(colorKey ?? name) }, selected && styles.ring]}>
          <Text style={[styles.initials, size < TARGET && styles.initialsSmall]}>{initials(name).slice(0, 1)}</Text>
        </View>
      )}
      {selected && (
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
      )}
    </View>
  );
};

/** Overlapping small circles: who from your friends is at the game. */
export const AvatarStack: React.FC<{ people: User[]; max?: number }> = ({ people, max = 4 }) => (
  <View style={styles.stack} accessibilityLabel={`${people.length} friends at the game`}>
    {people.slice(0, max).map((person, index) => (
      <View key={person.id} style={[styles.stackItem, index > 0 && styles.stackOverlap]}>
        <Avatar name={friendName(person)} colorKey={person.id} pictureUrl={person.profilePictureUrl} size={spacing[6]} />
      </View>
    ))}
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
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    style={styles.scroll}
    contentContainerStyle={styles.scrollContent}
  >
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
          <Avatar name={name} colorKey={friend.id} pictureUrl={friend.profilePictureUrl} selected={isSelected} />
          <Text style={[styles.name, isSelected && styles.nameSelected]} numberOfLines={1}>
            {name.split(' ')[0]}
          </Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  scroll: {
    marginHorizontal: -spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  friend: {
    width: spacing[14],
    alignItems: 'center',
    marginRight: spacing.xs,
    paddingTop: spacing.xs,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 3,
    borderColor: colors.primary,
  },
  initials: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  initialsSmall: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  check: {
    position: 'absolute',
    right: -spacing.xs,
    bottom: -spacing.xs,
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
  nameSelected: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  stack: {
    flexDirection: 'row',
  },
  stackItem: {
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: spacing.radius.full,
  },
  stackOverlap: {
    marginLeft: -spacing.sm,
  },
});
