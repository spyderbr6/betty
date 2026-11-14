/**
 * Squares start from the game: the next 14 days, grouped by day, with team search. The
 * game you are checked in to is listed first (greyed out once it has started: a grid needs
 * every period). A friend signal ("Morgan and Sam have squares on this") opens their grid,
 * so people join it instead of starting a duplicate.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, commonStyles, spacing, textStyles, typography } from '../../styles';
import { gameTeams } from '../../services/createBetFlowLogic';
import {
  canTakeSquares,
  groupGamesByDay,
  searchGames,
  type GameForSquares,
} from '../../services/squaresSetupLogic';
import { createStyles } from './styles';

interface SquaresGameListProps {
  games: GameForSquares[];
  checkedInGame: GameForSquares | null;
  loading: boolean;
  /** Per game id: the friend signal and the friend's grid it opens */
  signals: Map<string, { text: string; squaresGameId: string }>;
  onPick: (game: GameForSquares) => void;
  onOpenFriendGrid: (squaresGameId: string) => void;
  onBack: () => void;
  now: Date;
}

const SPORT_LABELS: Record<string, string> = {
  NFL: 'NFL',
  NBA: 'NBA',
  MLB: 'MLB',
  NHL: 'NHL',
  SOCCER: 'Soccer',
  COLLEGE_FOOTBALL: 'College',
  COLLEGE_BASKETBALL: 'College hoops',
  OTHER: 'Other',
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const SquaresGameList: React.FC<SquaresGameListProps> = ({
  games,
  checkedInGame,
  loading,
  signals,
  onPick,
  onOpenFriendGrid,
  onBack,
  now,
}) => {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const sports = useMemo(() => Array.from(new Set(games.map((game) => game.sport ?? 'OTHER'))), [games]);
  const shown = useMemo(() => {
    const listed = games.filter((game) => game.id !== checkedInGame?.id && (!sport || (game.sport ?? 'OTHER') === sport));
    return groupGamesByDay(searchGames(listed, query), now);
  }, [games, checkedInGame?.id, sport, query, now]);

  const row = (game: GameForSquares, testID: string) => {
    const { away, home } = gameTeams(game);
    const open = canTakeSquares(game, now);
    const signal = signals.get(game.id);
    const detail = open
      ? [SPORT_LABELS[game.sport ?? 'OTHER'], game.round ? (/^\d+$/.test(game.round) ? `Week ${game.round}` : game.round) : null]
          .filter(Boolean)
          .join(' · ')
      : 'Already started · squares need a full game';
    return (
      <View key={game.id} style={[styles.row, !open && styles.rowClosed]}>
        <TouchableOpacity
          testID={testID}
          onPress={() => onPick(game)}
          disabled={!open}
          accessibilityRole="button"
          accessibilityState={{ disabled: !open }}
          accessibilityLabel={`${away} at ${home}, ${timeOf(game.scheduledTime)}${open ? '' : ', already started'}`}
          style={styles.rowMain}
        >
          <View style={styles.rowText}>
            <Text style={styles.teams} numberOfLines={1}>
              {away} <Text style={styles.at}>@</Text> {home}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>{detail}</Text>
          </View>
          <Text style={styles.time}>{timeOf(game.scheduledTime)}</Text>
        </TouchableOpacity>
        {signal && open && (
          <TouchableOpacity
            testID={`${testID}-friends`}
            onPress={() => onOpenFriendGrid(signal.squaresGameId)}
            accessibilityRole="button"
            style={styles.signal}
          >
            <Text style={createStyles.link}>{signal.text} ›</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View>
      <View style={createStyles.block}>
        <TouchableOpacity testID="create-squares-back" onPress={onBack} accessibilityRole="button">
          <Text style={createStyles.link}>‹ Back to bet</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">Pick a game for your squares</Text>
        <TextInput
          testID="create-squares-search"
          style={styles.search}
          placeholder="Search teams"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search teams"
        />
        {sports.length > 1 && (
          <View style={[createStyles.chipRow, { marginTop: spacing.sm }]}>
            {[null, ...sports].map((id) => (
              <TouchableOpacity
                key={id ?? 'all'}
                testID={`create-squares-sport-${id ?? 'all'}`}
                style={[createStyles.chip, sport === id && createStyles.chipSelected]}
                onPress={() => setSport(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: sport === id }}
              >
                <Text style={createStyles.chipText}>{id ? SPORT_LABELS[id] ?? id : 'All'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {checkedInGame && (
        <View style={createStyles.block}>
          <Text style={[createStyles.label, styles.dayLabel]}>Your checked-in game</Text>
          {row(checkedInGame, 'create-squares-game-checked-in')}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>
          {query.trim() ? 'No games match that search.' : 'No upcoming games in the next 14 days.'}
        </Text>
      ) : (
        shown.map((group) => (
          <View key={group.label} style={createStyles.block}>
            <Text style={[createStyles.label, styles.dayLabel]}>{group.label}</Text>
            {group.games.map((game) => row(game, `create-squares-game-${game.id}`))}
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  search: {
    ...commonStyles.textInput,
    textAlignVertical: 'center',
  },
  dayLabel: {
    marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowClosed: {
    borderStyle: 'dashed',
    backgroundColor: colors.background,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.padding.sm,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  teams: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  at: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.normal,
  },
  detail: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  time: {
    ...textStyles.label,
    color: colors.textPrimary,
  },
  signal: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.sm,
  },
  empty: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
