/**
 * Who to invite (friends at your game come first and start invited), the full list
 * behind "All friends ›", and who can join: friends (it shows on their Join tab), or only
 * the people invited.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles } from '../../styles';
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
  /** Overrides the invite row's label (squares: "Notify · optional") */
  label?: string;
}

/** Friends / Invited only, on its own row. */
export const WhoCanJoin: React.FC<{ isPrivate: boolean; onChange: (isPrivate: boolean) => void }> = ({ isPrivate, onChange }) => (
  <View style={[createStyles.block, styles.joinRow]}>
    <Text style={styles.joinLabel}>Who can join</Text>
    <View style={[createStyles.segment, styles.segment]} accessibilityRole="radiogroup">
      {[
        { value: false, label: 'Friends', testID: 'create-join-friends' },
        { value: true, label: 'Invited only', testID: 'create-join-invited' },
      ].map((option) => {
        const active = option.value === isPrivate;
        return (
          <TouchableOpacity
            key={option.label}
            testID={option.testID}
            style={[createStyles.segmentItem, styles.segmentItem, active && createStyles.segmentItemActive]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
          >
            <Text style={[createStyles.segmentText, active && createStyles.segmentTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

export const FriendRow: React.FC<FriendRowProps> = ({
  friends,
  atGame,
  selected,
  onToggle,
  onAllFriends,
  isPrivate,
  onPrivacyChange,
  label,
}) => {
  const anyAtGame = friends.some((friend) => atGame.has(friend.id));
  return (
    <>
      <WhoCanJoin isPrivate={isPrivate} onChange={onPrivacyChange} />
      <View style={createStyles.block}>
        <View style={createStyles.labelRow}>
          <Text style={createStyles.label}>{label ?? (anyAtGame ? 'At the game · invited' : 'Invite friends · optional')}</Text>
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
          <FriendAvatars friends={friends} selected={selected} atGame={atGame} onToggle={onToggle} testIDPrefix="create-friend" />
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  empty: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  joinLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  segment: {
    flexGrow: 0,
    flexShrink: 0,
  },
  segmentItem: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    paddingHorizontal: spacing.padding.sm,
  },
});
