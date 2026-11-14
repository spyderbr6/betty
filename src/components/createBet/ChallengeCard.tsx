/**
 * A one-on-one challenge: pick the person first (friends at your game first), then the
 * card shows you and them on opposite sides; ⇄ swaps who has which.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { User } from '../../types/betting';
import { Avatar, FriendAvatars } from './FriendAvatars';
import { friendName } from '../../services/createBetFlowLogic';
import { SidePresetSwitch, SideTile, type SidePreset } from './SidePicker';
import { createStyles } from './styles';

interface ChallengeCardProps {
  friends: User[];
  atGame: Set<string>;
  opponentId: string | null;
  onPickOpponent: (friendId: string) => void;
  options: string[];
  /** Your side; the opponent gets the other */
  pickedIndex: number | null;
  onPick: (index: number) => void;
  onSwap: () => void;
  onRename: (index: number, name: string) => void;
  presets: SidePreset[];
  activePresetId: string;
  onPreset: (preset: SidePreset) => void;
  myName: string;
}

export const ChallengeCard: React.FC<ChallengeCardProps> = ({
  friends,
  atGame,
  opponentId,
  onPickOpponent,
  options,
  pickedIndex,
  onPick,
  onSwap,
  onRename,
  presets,
  activePresetId,
  onPreset,
  myName,
}) => {
  const opponent = friends.find((friend) => friend.id === opponentId) ?? null;
  const opponentLabel = opponent ? friendName(opponent) : 'Anyone';
  const editable = activePresetId === 'custom';
  const mine = pickedIndex ?? 0;
  const theirs = mine === 0 ? 1 : 0;
  const anyAtGame = friends.some((friend) => atGame.has(friend.id));

  return (
    <>
      <View style={createStyles.block}>
        <Text style={[createStyles.label, { marginBottom: spacing.sm }]}>
          Who are you challenging?{anyAtGame ? ' · At the game first' : ''}
        </Text>
        {friends.length === 0 ? (
          <Text style={styles.empty}>Add friends to challenge them. Without one, anyone can take the other side.</Text>
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

      <View style={createStyles.block}>
        <SidePresetSwitch label="The sides" presets={presets} activeId={activePresetId} onPick={onPreset} />
        <View style={styles.card}>
          <View style={styles.party}>
            <Avatar name={myName} size={spacing[8]} />
            <Text style={styles.partyName}>You</Text>
            <View style={styles.tileWrap}>
              <SideTile
                testID="create-challenge-mine"
                name={options[mine]}
                picked={pickedIndex !== null}
                editable={editable}
                onPick={() => onPick(mine)}
                onRename={(text) => onRename(mine, text)}
                pickedHint="✓ YOU"
              />
            </View>
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
            <Avatar name={opponentLabel} pictureUrl={opponent?.profilePictureUrl} size={spacing[8]} />
            <Text style={styles.partyName} numberOfLines={1}>{opponentLabel}</Text>
            <View style={styles.tileWrap}>
              <SideTile
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
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  empty: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  party: {
    flex: 1,
    alignItems: 'center',
  },
  partyName: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  tileWrap: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flex: 1,
  },
  middle: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  vs: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
  },
  swap: {
    marginTop: spacing.sm,
    width: spacing[9],
    height: spacing[9],
    borderRadius: spacing.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapText: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
});
