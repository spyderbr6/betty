/**
 * The game you are checked in to, at the top of Create: score, period and clock, and
 * "Change game". Replaces the header's check-in banner on this screen while checked in.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { LiveEvent } from '../../types/events';
import { gameTeams } from '../../services/createBetFlowLogic';

interface GameHeaderProps {
  event: LiveEvent;
  onChangeGame: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({ event, onChangeGame }) => {
  const { away, home } = gameTeams(event);
  const live = event.status === 'LIVE' || event.status === 'HALFTIME';
  const clock =
    event.status === 'HALFTIME'
      ? 'Halftime'
      : [event.quarter, event.timeLeft].filter(Boolean).join(' · ');
  const kickoff = new Date(event.scheduledTime).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.container} testID="create-game-header">
      <View style={styles.topRow}>
        <View style={styles.statusRow}>
          {live ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : (
            <Text style={styles.statusText}>{event.status === 'FINISHED' ? 'Final' : kickoff}</Text>
          )}
          {live && !!clock && <Text style={styles.statusText}>{clock}</Text>}
        </View>
        <TouchableOpacity
          testID="create-change-game"
          onPress={onChangeGame}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.changeGame}>Change game</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.team} numberOfLines={1}>{away}</Text>
        {live || event.status === 'FINISHED' ? (
          <Text style={styles.score}>
            {event.awayScore} – {event.homeScore}
          </Text>
        ) : (
          <Text style={styles.at}>@</Text>
        )}
        <Text style={[styles.team, styles.teamRight]} numberOfLines={1}>{home}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.padding.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveBadge: {
    backgroundColor: colors.live,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    marginRight: spacing.sm,
  },
  liveText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  changeGame: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  team: {
    ...textStyles.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  teamRight: {
    textAlign: 'right',
  },
  score: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    marginHorizontal: spacing.md,
  },
  at: {
    ...textStyles.h4,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
  },
});
