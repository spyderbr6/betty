/**
 * A one-on-one challenge, as the design lays it out: pick the person first (friends at
 * your game first), then a card with you and them facing each other on opposite sides;
 * ⇄ swaps who has which.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { User } from '../../types/betting';
import { Avatar, FriendAvatars } from './FriendAvatars';
import { friendName } from '../../services/createBetFlowLogic';
import { SidePresetSwitch, SideTile, type SidePreset } from './SidePicker';
import { createStyles, TARGET } from './styles';

interface ChallengeOpponentsProps {
  friends: User[];
  atGame: Set<string>;
  opponentId: string | null;
  onPickOpponent: (friendId: string) => void;
}

/** Who you are challenging: one pick, friends at the game first. */
export const ChallengeOpponents: React.FC<ChallengeOpponentsProps> = ({ friends, atGame, opponentId, onPickOpponent }) => {
  const anyAtGame = friends.some((friend) => atGame.has(friend.id));
  return (
    <View style={createStyles.block}>
      <Text style={[createStyles.label, styles.labelGap]}>
        Who are you challenging?{anyAtGame ? ' · At the game first' : ''}
      </Text>
      {friends.length === 0 ? (
        <Text style={styles.empty}>Add friends to challenge them. Without one, any friend can take the other side.</Text>
      ) : (
        <FriendAvatars
          friends={friends}
          selected={new Set(opponentId ? [opponentId] : [])}
          atGame={atGame}
          onToggle={onPickOpponent}
          testIDPrefix="create-opponent"
        />
      )}
    </View>
  );
};

interface ChallengeCardProps {
  friends: User[];
  opponentId: string | null;
  options: string[];
  /** Your side; the opponent gets the other */
  pickedIndex: number | null;
  onPick: (index: number) => void;
  onSwap: () => void;
  onRename: (index: number, name: string) => void;
  presets: SidePreset[];
  activePresetId: string;
  onPreset: (preset: SidePreset) => void;
  /** Your own profile picture, signed; initials without one */
  myPictureUrl?: string;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  friends,
  opponentId,
  options,
  pickedIndex,
  onPick,
  onSwap,
  onRename,
  presets,
  activePresetId,
  onPreset,
  myPictureUrl,
}) => {
  const opponent = friends.find((friend) => friend.id === opponentId) ?? null;
  const opponentLabel = opponent ? friendName(opponent).split(' ')[0] : 'Any friend';
  const editable = activePresetId === 'custom';
  const mine = pickedIndex ?? 0;
  const theirs = mine === 0 ? 1 : 0;

  return (
    <View style={createStyles.block}>
      <SidePresetSwitch label="The sides" presets={presets} activeId={activePresetId} onPick={onPreset} />
      <View style={[createStyles.card, styles.card]}>
        <View style={styles.party}>
          <Avatar name="You" fill={colors.primaryDark} pictureUrl={myPictureUrl} size={spacing[12]} />
          <Text style={styles.partyName}>You</Text>
          <SideTile
            compact
            testID="create-challenge-mine"
            name={options[mine]}
            picked={pickedIndex !== null}
            editable={editable}
            onPick={() => onPick(mine)}
            onRename={(text) => onRename(mine, text)}
          />
        </View>
        <View style={styles.middle}>
          <Text style={styles.vs}>VS</Text>
          <TouchableOpacity
            testID="create-challenge-swap"
            style={styles.swap}
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel="Swap sides"
          >
            <Text style={styles.swapText}>⇄</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.party}>
          <Avatar
            name={opponent ? friendName(opponent) : '?'}
            colorKey={opponent?.id}
            fill={opponent ? undefined : colors.surfaceLight}
            pictureUrl={opponent?.profilePictureUrl}
            size={spacing[12]}
          />
          <Text style={styles.partyName} numberOfLines={1}>
            {opponentLabel}
          </Text>
          <SideTile
            compact
            testID="create-challenge-theirs"
            name={options[theirs]}
            picked={false}
            editable={editable}
            onPick={onSwap}
            onRename={(text) => onRename(theirs, text)}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  labelGap: {
    marginBottom: spacing.sm,
  },
  empty: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: spacing.md,
  },
  party: {
    flex: 1,
    alignItems: 'center',
  },
  partyName: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.padding.sm,
  },
  middle: {
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.padding.sm,
  },
  vs: {
    ...textStyles.label,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  swap: {
    width: TARGET,
    height: TARGET,
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapText: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
});
