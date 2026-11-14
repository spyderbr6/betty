/**
 * Who to invite (friends at your game come first and start invited), the full list
 * behind "All friends ›", and who can join: anyone, or only the people invited.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { User } from '../../types/betting';
import { FriendAvatars } from './FriendAvatars';
import { createStyles } from './styles';

interface FriendRowProps {
  friends: User[];
  atGame: Set<string>;
  selected: Set<string>;
  onToggle: (friendId: string) => void;
  onAllFriends: () => void;
  isPrivate: boolean;
  onPrivacyChange: (isPrivate: boolean) => void;
  /** A challenge picks its opponent elsewhere and is always open to that one person */
  showInvites: boolean;
}

export const FriendRow: React.FC<FriendRowProps> = ({
  friends,
  atGame,
  selected,
  onToggle,
  onAllFriends,
  isPrivate,
  onPrivacyChange,
  showInvites,
}) => {
  const anyAtGame = friends.some((friend) => atGame.has(friend.id));
  return (
    <View style={createStyles.block}>
      {showInvites && (
        <>
          <View style={createStyles.labelRow}>
            <Text style={createStyles.label}>{anyAtGame ? 'At the game · invited' : 'Invite friends · optional'}</Text>
            {friends.length > 0 && (
              <TouchableOpacity
                testID="create-all-friends"
                onPress={onAllFriends}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={createStyles.link}>All friends ›</Text>
              </TouchableOpacity>
            )}
          </View>
          {friends.length === 0 ? (
            <Text style={styles.empty}>Add friends to invite them to your bets.</Text>
          ) : (
            <FriendAvatars
              friends={friends}
              selected={selected}
              atGame={atGame}
              onToggle={onToggle}
              testIDPrefix="create-friend"
            />
          )}
        </>
      )}

      <View style={[createStyles.labelRow, styles.joinRow]}>
        <Text style={createStyles.label}>Who can join</Text>
        <View style={styles.segment} accessibilityRole="radiogroup">
          {[
            { value: false, label: 'Anyone', testID: 'create-join-anyone' },
            { value: true, label: 'Invited only', testID: 'create-join-invited' },
          ].map((option) => {
            const active = option.value === isPrivate;
            return (
              <TouchableOpacity
                key={option.label}
                testID={option.testID}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => onPrivacyChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  joinRow: {
    marginTop: spacing.md,
    marginBottom: 0,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xs / 2,
  },
  segmentItem: {
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.xs + spacing.xs / 2,
    borderRadius: spacing.radius.md,
  },
  segmentItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  segmentText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
});
