/**
 * Squares start from the game: the next 14 days, grouped by day, with team search and a
 * sport filter. The game you are checked in to is listed first (it says so once it has
 * started: a grid needs every period). A game where friends already have an open grid
 * says who, so people join theirs instead of starting another.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { gameTeams } from '../../services/createBetFlowLogic';
import { canTakeSquares, groupGamesByDay, searchGames, type GameForSquares } from '../../services/squaresSetupLogic';
import { createStyles, TARGET } from './styles';

interface SquaresGameListProps {
  games: GameForSquares[];
  checkedInGame: GameForSquares | null;
  loading: boolean;
  /** Per game id: who already has squares on it */
  signals: Map<string, { text: string; squaresGameId: string }>;
  onPick: (game: GameForSquares) => void;
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

export const SquaresGameList: React.FC<SquaresGameListProps> = ({ games, checkedInGame, loading, signals, onPick, now }) => {
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState<string | null>(null);
  const sports = useMemo(() => Array.from(new Set(games.map((game) => game.sport ?? 'OTHER'))), [games]);
  const shown = useMemo(() => {
    const listed = games.filter((game) => game.id !== checkedInGame?.id && (!sport || (game.sport ?? 'OTHER') === sport));
    return groupGamesByDay(searchGames(listed, query), now);
  }, [games, checkedInGame?.id, sport, query, now]);

  const row = (game: GameForSquares & { quarter?: string | null; timeLeft?: string | null }, testID: string) => {
    const { away, home } = gameTeams(game);
    const open = canTakeSquares(game, now);
    const signal = signals.get(game.id);
    const detail = !open
      ? 'Already started · squares need a full game'
      : signal?.text ??
        [SPORT_LABELS[game.sport ?? 'OTHER'], game.round ? (/^\d+$/.test(game.round) ? `Week ${game.round}` : game.round) : null]
          .filter(Boolean)
          .join(' · ');
    const right = open ? timeOf(game.scheduledTime) : [game.quarter, game.timeLeft].filter(Boolean).join(' ') || 'Live';
    return (
      <TouchableOpacity
        key={game.id}
        testID={testID}
        onPress={() => onPick(game)}
        disabled={!open}
        accessibilityRole="button"
        accessibilityState={{ disabled: !open }}
        accessibilityLabel={`${away} at ${home}, ${right}${open ? '' : ', already started'}`}
        style={styles.row}
      >
        <View style={styles.rowText}>
          <Text style={styles.teams} numberOfLines={1}>
            {away} <Text style={styles.at}>at</Text> {home}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Text style={[styles.time, !open && styles.timeLive]}>{right}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <View style={createStyles.block}>
        <TextInput
          testID="create-squares-search"
          style={styles.search}
          placeholder="⌕  Search teams"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search teams"
        />
        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sports}>
            {sports.map((id) => {
              const active = sport === id;
              return (
                <TouchableOpacity
                  key={id}
                  testID={`create-squares-sport-${id}`}
                  style={[createStyles.chip, styles.sportChip, active && createStyles.chipSelected]}
                  onPress={() => setSport(active ? null : id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[createStyles.chipText, active && createStyles.chipTextSelected]}>{SPORT_LABELS[id] ?? id}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {checkedInGame && (
        <View style={createStyles.block}>
          <Text style={createStyles.label}>Your checked-in game</Text>
          {row(checkedInGame, 'create-squares-game-checked-in')}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : shown.length === 0 ? (
        <Text style={styles.empty}>{query.trim() ? 'No games match that search.' : 'No upcoming games in the next 14 days.'}</Text>
      ) : (
        shown.map((group) => (
          <View key={group.label} style={createStyles.block}>
            <Text style={createStyles.label}>{group.label}</Text>
            {group.games.map((game) => row(game, `create-squares-game-${game.id}`))}
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  search: {
    height: TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.xl,
    paddingHorizontal: spacing.padding.sm,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    textAlignVertical: 'center',
  },
  sports: {
    marginTop: spacing.padding.sm,
  },
  sportChip: {
    marginBottom: 0,
  },
  row: {
    minHeight: spacing[16] - spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.padding.sm,
  },
  teams: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  at: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.normal,
  },
  detail: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  time: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.normal,
  },
  timeLive: {
    color: colors.textSecondary,
  },
  loading: {
    marginTop: spacing.lg,
  },
  empty: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
