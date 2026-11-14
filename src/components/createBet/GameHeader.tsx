/**
 * The game you are checked in to, as a card at the top of Create: live dot, period and
 * clock, "Change game", the score with the numbers in yellow, and which friends are there.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { LiveEvent } from '../../types/events';
import type { User } from '../../types/betting';
import { gameTeams } from '../../services/createBetFlowLogic';
import { AvatarStack } from './FriendAvatars';
import { createStyles } from './styles';

interface GameHeaderProps {
  event: LiveEvent;
  onChangeGame: () => void;
  friendsHere: User[];
}

export const GameHeader: React.FC<GameHeaderProps> = ({ event, onChangeGame, friendsHere }) => {
  const { away, home } = gameTeams(event);
  const live = event.status === 'LIVE' || event.status === 'HALFTIME';
  const scored = live || event.status === 'FINISHED';
  const clock = event.status === 'HALFTIME' ? 'Halftime' : [event.quarter, event.timeLeft].filter(Boolean).join(' · ');
  const kickoff = new Date(event.scheduledTime).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <View style={[createStyles.card, styles.card]} testID="create-game-header">
      <View style={styles.topRow}>
        <View style={styles.status}>
          {live ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.live}>LIVE</Text>
              {!!clock && <Text style={styles.clock}>{clock}</Text>}
            </>
          ) : (
            <Text style={styles.clock}>{event.status === 'FINISHED' ? 'Final' : kickoff}</Text>
          )}
        </View>
        <TouchableOpacity
          testID="create-change-game"
          onPress={onChangeGame}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={createStyles.link}>Change game</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.score} numberOfLines={1}>
          {away}{' '}
          {scored ? (
            <>
              <Text style={styles.number}>{event.awayScore}</Text>
              <Text style={styles.dash}> – </Text>
              <Text style={styles.number}>{event.homeScore}</Text>
            </>
          ) : (
            <Text style={styles.dash}>at</Text>
          )}{' '}
          {home}
        </Text>
        {friendsHere.length > 0 && <AvatarStack people={friendsHere} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.radius.full,
    backgroundColor: colors.error,
    marginRight: spacing.sm,
  },
  live: {
    ...textStyles.caption,
    color: colors.error,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.wider,
    marginRight: spacing.sm,
  },
  clock: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  score: {
    ...textStyles.h3,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  number: {
    color: colors.primary,
  },
  dash: {
    color: colors.textMuted,
    fontWeight: typography.fontWeight.normal,
  },
});
