/**
 * Squares from the Create screen (the design's "Squares setup"): pick a game, then one
 * screen for the price (with the pot it makes), payouts as a preset, who can join and who
 * to notify, then a confirmation whose next step is claiming your own squares.
 *
 * Squares are usually set up days ahead, so this never depends on being checked in; the
 * game you are at is just listed first.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../../contexts/ProfileContext';
import { useBetData } from '../../contexts/BetDataContext';
import { showAlert } from '../ui/CustomAlert';
import type { User } from '../../types/betting';
import { friendName, gameTeams, joinNames } from '../../services/createBetFlowLogic';
import {
  DEFAULT_PRICE,
  PAYOUT_PRESETS,
  PERIOD_LABELS,
  SQUARES_DEFAULT_PRIVATE,
  SQUARES_PER_GRID,
  canTakeSquares,
  formatDollars,
  friendSquaresSignal,
  fullPot,
  lockLabel,
  payoutAmounts,
  percentsTotal,
  stepPrice,
  type GameForSquares,
  type PayoutPercents,
} from '../../services/squaresSetupLogic';
import { createSquares, inviteToSquares, loadSquaresGames } from '../../services/squaresSetupService';
import { SquaresGameList } from './SquaresGameList';
import { FriendRow } from './FriendRow';
import { FriendPickerModal } from './FriendPickerModal';
import { CreateBar } from './CreateBar';
import { createStyles } from './styles';

interface SquaresSetupProps {
  checkedInGame: GameForSquares | null;
  friends: User[];
  onBack: () => void;
}

interface CreatedGame {
  id: string;
  matchup: string;
  price: number;
  lock: string;
  notified: string[];
}

const PERCENT_STEP = 5;

export const SquaresSetup: React.FC<SquaresSetupProps> = ({ checkedInGame, friends, onBack }) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { joinableFriendsSquaresGames } = useBetData();
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = useMemo(() => new Date(), []);

  const [games, setGames] = useState<GameForSquares[]>([]);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<GameForSquares | null>(null);
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [percents, setPercents] = useState<PayoutPercents>(PAYOUT_PRESETS[0].percents);
  const [presetId, setPresetId] = useState<string>(PAYOUT_PRESETS[0].id);
  const [description, setDescription] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [isPrivate, setIsPrivate] = useState(SQUARES_DEFAULT_PRIVATE);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedGame | null>(null);
  const [barHeight, setBarHeight] = useState<number>(spacing[24]);

  useEffect(() => {
    let cancelled = false;
    loadSquaresGames()
      .then((loaded) => !cancelled && setGames(loaded))
      .catch((error) => console.error('[Squares] Error loading games:', error))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Friends' open grids by game, so a game can say who already has squares on it
  const signals = useMemo(() => {
    const names = new Map(friends.map((friend) => [friend.id, friendName(friend)]));
    const byGame = new Map<string, { names: string[]; squaresGameId: string }>();
    for (const squares of joinableFriendsSquaresGames) {
      const name = names.get(squares.creatorId);
      if (!name || !squares.eventId) continue;
      const entry = byGame.get(squares.eventId) ?? { names: [], squaresGameId: squares.id };
      entry.names.push(name);
      byGame.set(squares.eventId, entry);
    }
    const result = new Map<string, { text: string; squaresGameId: string }>();
    byGame.forEach((entry, eventId) => {
      const text = friendSquaresSignal(entry.names);
      if (text) result.set(eventId, { text, squaresGameId: entry.squaresGameId });
    });
    return result;
  }, [joinableFriendsSquaresGames, friends]);

  const openGrid = useCallback(
    (gameId: string) => navigation.navigate('Bets', { screen: 'SquaresGameDetail', params: { gameId } }),
    [navigation],
  );

  const toggleFriend = (friendId: string) =>
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });

  const stepPercent = (index: number, direction: 1 | -1) =>
    setPercents((prev) => {
      const next = [...prev] as PayoutPercents;
      next[index] = Math.max(0, Math.min(100, next[index] + direction * PERCENT_STEP));
      return next;
    });

  const total = percentsTotal(percents);
  const pot = fullPot(price);
  const matchup = game ? `${gameTeams(game).away} at ${gameTeams(game).home}` : '';

  const handleCreate = async () => {
    if (!user?.userId || !game) return;
    if (!canTakeSquares(game, new Date())) {
      showAlert('Game Started', 'This game has started. Squares need a game that has not kicked off.');
      return;
    }
    if (total !== 100) {
      showAlert('Payouts', 'The payouts need to add up to 100%.');
      return;
    }
    setCreating(true);
    try {
      const squares = await createSquares({ creatorId: user.userId, game, price, percents, description, isPrivate });
      const invitedIds = await inviteToSquares({
        gameId: squares.id,
        locksAt: squares.locksAt,
        fromUserId: user.userId,
        fromName: profile?.displayName || profile?.username || user.username,
        friendIds: Array.from(selectedFriends),
      });
      setCreated({
        id: squares.id,
        matchup,
        price,
        lock: lockLabel(game.scheduledTime),
        notified: invitedIds
          .map((id) => friends.find((friend) => friend.id === id))
          .filter((friend): friend is User => !!friend)
          .map(friendName),
      });
    } catch (error) {
      console.error('[Squares] Error creating squares game:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      showAlert('Error', `Failed to create squares game: ${message}`, [{ text: 'OK' }]);
    } finally {
      setCreating(false);
    }
  };

  // ---------------------------------------------------------------------------

  if (created) {
    return (
      <ScrollView contentContainerStyle={styles.created} testID="create-squares-created">
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
        <Text style={styles.createdTitle} accessibilityRole="header">Squares created</Text>
        {created.notified.length > 0 && (
          <Text style={styles.createdLine}>
            {joinNames(created.notified)} {created.notified.length === 1 ? 'was' : 'were'} notified
          </Text>
        )}
        <Text style={styles.createdMatchup}>{created.matchup}</Text>
        <Text testID="create-squares-created-summary" style={styles.createdLine}>
          {formatDollars(created.price)} a square · 0 of {SQUARES_PER_GRID} taken
        </Text>
        <Text style={styles.createdLine}>Locks {created.lock}</Text>
        <TouchableOpacity testID="create-squares-pick" style={styles.primary} onPress={() => openGrid(created.id)} accessibilityRole="button">
          <Text style={styles.primaryText}>Pick your squares</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="create-squares-done" style={styles.secondary} onPress={onBack} accessibilityRole="button">
          <Text style={styles.secondaryText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (!game) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <SquaresGameList
          games={games}
          checkedInGame={checkedInGame}
          loading={loading}
          signals={signals}
          onPick={setGame}
          onOpenFriendGrid={openGrid}
          onBack={onBack}
          now={now}
        />
      </ScrollView>
    );
  }

  const { away, home } = gameTeams(game);
  const kickoff = new Date(game.scheduledTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={styles.fill}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: barHeight + spacing.lg }}
        testID="create-squares-setup"
      >
        <View style={createStyles.block}>
          <View style={styles.gameCard}>
            <View style={styles.gameText}>
              <Text style={styles.gameTeams}>
                {away} <Text style={styles.gameAt}>@</Text> {home}
              </Text>
              <Text style={styles.gameWhen}>{kickoff} · locks at kickoff</Text>
            </View>
            <TouchableOpacity testID="create-squares-change-game" onPress={() => setGame(null)} accessibilityRole="button">
              <Text style={createStyles.link}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={createStyles.block}>
          <Text style={[createStyles.label, styles.labelGap]}>Price per square</Text>
          <View style={styles.priceRow}>
            <TouchableOpacity
              testID="create-squares-price-down"
              style={styles.stepButton}
              onPress={() => setPrice((p) => stepPrice(p, -1))}
              accessibilityRole="button"
              accessibilityLabel="Lower the price"
            >
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            <Text testID="create-squares-price" style={styles.price}>{formatDollars(price)}</Text>
            <TouchableOpacity
              testID="create-squares-price-up"
              style={styles.stepButton}
              onPress={() => setPrice((p) => stepPrice(p, 1))}
              accessibilityRole="button"
              accessibilityLabel="Raise the price"
            >
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
            <Text testID="create-squares-pot" style={styles.pot}>
              Pot {formatDollars(pot)} when all {SQUARES_PER_GRID} fill
            </Text>
          </View>
        </View>

        <View style={createStyles.block}>
          <Text style={[createStyles.label, styles.labelGap]}>Payouts</Text>
          <View style={createStyles.chipRow}>
            {[...PAYOUT_PRESETS, { id: 'custom', label: 'Custom', percents }].map((preset) => (
              <TouchableOpacity
                key={preset.id}
                testID={`create-squares-payout-${preset.id}`}
                style={[createStyles.chip, presetId === preset.id && createStyles.chipSelected]}
                onPress={() => {
                  setPresetId(preset.id);
                  if (preset.id !== 'custom') setPercents(preset.percents);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: presetId === preset.id }}
              >
                <Text style={createStyles.chipText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {presetId === 'custom' ? (
            <View>
              {PERIOD_LABELS.map((label, index) => (
                <View key={label} style={styles.customRow}>
                  <Text style={styles.customLabel}>{label}</Text>
                  <TouchableOpacity
                    testID={`create-squares-percent-${index}-down`}
                    style={styles.stepButtonSmall}
                    onPress={() => stepPercent(index, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Lower the ${label} share`}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text testID={`create-squares-percent-${index}`} style={styles.customValue}>
                    {percents[index]}%
                  </Text>
                  <TouchableOpacity
                    testID={`create-squares-percent-${index}-up`}
                    style={styles.stepButtonSmall}
                    onPress={() => stepPercent(index, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Raise the ${label} share`}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.customDollars}>{formatDollars(Math.round(pot * percents[index]) / 100)}</Text>
                </View>
              ))}
              <Text testID="create-squares-percent-total" style={[styles.total, total !== 100 && styles.totalOff]}>
                Total {total}%{total !== 100 ? ' · must be 100%' : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.amounts}>
              {payoutAmounts(percents, pot).map((row) => (
                <View key={row.label} style={styles.amount}>
                  <Text style={styles.amountLabel}>{row.label}</Text>
                  <Text style={styles.amountValue}>{formatDollars(row.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {showDetails ? (
            <TextInput
              testID="create-squares-description"
              style={styles.details}
              placeholder="Rules or details (optional)"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              autoFocus
              accessibilityLabel="Details"
            />
          ) : (
            <TouchableOpacity
              testID="create-squares-add-details"
              onPress={() => setShowDetails(true)}
              accessibilityRole="button"
              style={{ marginTop: spacing.sm }}
            >
              <Text style={createStyles.link}>+ Add details</Text>
            </TouchableOpacity>
          )}
        </View>

        <FriendRow
          friends={friends}
          atGame={new Set()}
          selected={selectedFriends}
          onToggle={toggleFriend}
          onAllFriends={() => setShowAllFriends(true)}
          isPrivate={isPrivate}
          onPrivacyChange={setIsPrivate}
          showInvites={true}
          label="Notify · optional"
        />
      </ScrollView>

      <View style={styles.barHost} onLayout={(e: LayoutChangeEvent) => setBarHeight(e.nativeEvent.layout.height)}>
        <CreateBar
          label={`Create squares · ${formatDollars(price)} a square`}
          detail={`${matchup} · locks ${lockLabel(game.scheduledTime)}`}
          onPress={handleCreate}
          disabled={total !== 100}
          busy={creating}
        />
      </View>

      <FriendPickerModal
        visible={showAllFriends}
        onClose={() => setShowAllFriends(false)}
        friends={friends}
        atGame={new Set()}
        selected={selectedFriends}
        onToggle={toggleFriend}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  barHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  labelGap: {
    marginBottom: spacing.sm,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.padding.sm,
  },
  gameText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  gameTeams: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  gameAt: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.normal,
  },
  gameWhen: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  stepButton: {
    width: spacing[10],
    height: spacing[10],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonSmall: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  price: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    minWidth: spacing[20],
    textAlign: 'center',
  },
  pot: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.md,
    flexShrink: 1,
  },
  amounts: {
    flexDirection: 'row',
    marginHorizontal: -spacing.xs,
  },
  amount: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  amountLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  amountValue: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs / 2,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  customLabel: {
    ...textStyles.label,
    color: colors.textPrimary,
    width: spacing[14],
  },
  customValue: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    width: spacing[14],
    textAlign: 'center',
  },
  customDollars: {
    ...textStyles.label,
    color: colors.textSecondary,
    marginLeft: 'auto',
  },
  total: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  totalOff: {
    color: colors.warning,
  },
  details: {
    ...textStyles.body,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.padding.sm,
    marginTop: spacing.sm,
    minHeight: spacing[16],
  },
  created: {
    padding: spacing.lg,
  },
  check: {
    alignSelf: 'center',
    width: spacing[14],
    height: spacing[14],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    ...textStyles.h2,
    color: colors.textInverse,
  },
  createdTitle: {
    ...textStyles.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  createdMatchup: {
    ...textStyles.h4,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  createdLine: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.xl,
    paddingVertical: spacing.padding.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  secondary: {
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.padding.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryText: {
    ...textStyles.label,
    color: colors.textPrimary,
  },
});
