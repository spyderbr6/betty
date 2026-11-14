/**
 * Squares from the Create screen (the design's "Squares setup"), under its own "‹ Squares"
 * title bar: pick a game, then one screen for the price (with the pot it makes), payouts
 * as a preset, who can join and who to notify, then a sheet whose next step is claiming
 * your own squares. The back arrow goes from the setup to the game list, and from the
 * list back to the bet.
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
  percentsTotal,
  presetFor,
  stepPrice,
  type GameForSquares,
  type PayoutPercents,
} from '../../services/squaresSetupLogic';
import { createSquares, inviteToSquares, loadSquaresGames } from '../../services/squaresSetupService';
import { CreateHeader } from './CreateHeader';
import { SquaresGameList } from './SquaresGameList';
import { FriendRow } from './FriendRow';
import { FriendPickerModal } from './FriendPickerModal';
import { CreateBar } from './CreateBar';
import { SentSheet } from './SentSheet';
import { createStyles, sheetStyles } from './styles';

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
const GRID_DOTS = 10;

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
          .map((friend) => friendName(friend).split(' ')[0]),
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

  if (!game) {
    return (
      <View style={styles.fill}>
        <CreateHeader title="Squares" onBack={onBack} backTestID="create-squares-back" />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listContent}>
          <SquaresGameList games={games} checkedInGame={checkedInGame} loading={loading} signals={signals} onPick={setGame} now={now} />
        </ScrollView>
      </View>
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
  const friendsGrid = signals.get(game.id);
  const shares = PERIOD_LABELS.map((label, index) => ({ label, percent: percents[index], amount: Math.round(pot * percents[index]) / 100 }));

  return (
    <View style={styles.fill}>
      <CreateHeader title="Squares" onBack={() => setGame(null)} backTestID="create-squares-back" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: barHeight + spacing.lg }} testID="create-squares-setup">
        <View style={createStyles.block}>
          <View style={[createStyles.card, styles.gameCard]}>
            <View style={styles.gameText}>
              <Text style={styles.gameTeams} numberOfLines={1}>
                {away} <Text style={styles.gameAt}>at</Text> {home}
              </Text>
              <Text style={styles.gameWhen}>{kickoff} · locks at kickoff</Text>
            </View>
            <TouchableOpacity testID="create-squares-change-game" onPress={() => setGame(null)} accessibilityRole="button">
              <Text style={createStyles.link}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        {friendsGrid && (
          <View style={createStyles.block}>
            <TouchableOpacity
              testID="create-squares-friend-grid"
              style={styles.notice}
              onPress={() => openGrid(friendsGrid.squaresGameId)}
              accessibilityRole="button"
            >
              <Text style={styles.noticeText}>{friendsGrid.text}</Text>
              <Text style={createStyles.link}>Join theirs ›</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={createStyles.block}>
          <View style={createStyles.card}>
            <Text style={createStyles.label}>Price per square</Text>
            <View style={styles.priceRow}>
              <TouchableOpacity
                testID="create-squares-price-down"
                style={createStyles.stepButton}
                onPress={() => setPrice((p) => stepPrice(p, -1))}
                accessibilityRole="button"
                accessibilityLabel="Lower the price"
              >
                <Text style={createStyles.stepText}>−</Text>
              </TouchableOpacity>
              <View style={styles.priceValue}>
                <Text testID="create-squares-price" style={styles.price}>
                  {formatDollars(price)}
                </Text>
                <Text testID="create-squares-pot" style={styles.pot}>
                  Pot <Text style={styles.potAmount}>{formatDollars(pot)}</Text> when all {SQUARES_PER_GRID} fill
                </Text>
              </View>
              <TouchableOpacity
                testID="create-squares-price-up"
                style={createStyles.stepButton}
                onPress={() => setPrice((p) => stepPrice(p, 1))}
                accessibilityRole="button"
                accessibilityLabel="Raise the price"
              >
                <Text style={createStyles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={createStyles.block}>
          <View style={createStyles.labelRow}>
            <Text style={createStyles.label}>Payouts</Text>
            <TouchableOpacity
              testID="create-squares-payout-custom"
              onPress={() => {
                if (presetId !== 'custom') return setPresetId('custom');
                // Back to the presets: the matching one, or Standard for a split that is none
                const match = presetFor(percents);
                setPresetId(match === 'custom' ? PAYOUT_PRESETS[0].id : match);
                if (match === 'custom') setPercents(PAYOUT_PRESETS[0].percents);
              }}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={createStyles.link}>{presetId === 'custom' ? 'Presets' : 'Custom'}</Text>
            </TouchableOpacity>
          </View>
          {presetId !== 'custom' && (
            <View style={createStyles.segment}>
              {PAYOUT_PRESETS.map((preset) => {
                const active = presetId === preset.id;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    testID={`create-squares-payout-${preset.id}`}
                    style={[createStyles.segmentItem, styles.payoutTab, active && createStyles.segmentItemActive]}
                    onPress={() => {
                      setPresetId(preset.id);
                      setPercents(preset.percents);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[createStyles.segmentText, active && createStyles.segmentTextActive]}>{preset.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {presetId === 'custom' ? (
            <View>
              {shares.map((share, index) => (
                <View key={share.label} style={styles.customRow}>
                  <Text style={styles.customLabel}>{share.label}</Text>
                  <TouchableOpacity
                    testID={`create-squares-percent-${index}-down`}
                    style={createStyles.stepButton}
                    onPress={() => stepPercent(index, -1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Lower the ${share.label} share`}
                  >
                    <Text style={createStyles.stepText}>−</Text>
                  </TouchableOpacity>
                  <Text testID={`create-squares-percent-${index}`} style={styles.customValue}>
                    {share.percent}%
                  </Text>
                  <TouchableOpacity
                    testID={`create-squares-percent-${index}-up`}
                    style={createStyles.stepButton}
                    onPress={() => stepPercent(index, 1)}
                    accessibilityRole="button"
                    accessibilityLabel={`Raise the ${share.label} share`}
                  >
                    <Text style={createStyles.stepText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.customDollars}>{formatDollars(share.amount)}</Text>
                </View>
              ))}
              <Text testID="create-squares-percent-total" style={[styles.total, total !== 100 && styles.totalOff]}>
                Total {total}%{total !== 100 ? ' · must be 100%' : ''}
              </Text>
            </View>
          ) : (
            // Each period's share of the pot as a bar, its width the share
            <View style={styles.bars}>
              {shares
                .filter((share) => share.percent > 0)
                .map((share, index, shown) => (
                  <View key={share.label} style={[styles.barCell, { flex: share.percent }, index > 0 && styles.barGap]}>
                    <View style={[styles.bar, index === shown.length - 1 && styles.barFinal]} />
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {share.label}
                    </Text>
                    <Text style={styles.barAmount} numberOfLines={1}>
                      {formatDollars(share.amount)}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {showDetails ? (
            <TextInput
              testID="create-squares-description"
              style={[createStyles.card, styles.details]}
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
            <TouchableOpacity testID="create-squares-add-details" onPress={() => setShowDetails(true)} accessibilityRole="button" style={styles.addDetails}>
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
          label="Notify · optional"
        />
      </ScrollView>

      {!created && (
        <View style={styles.barHost} onLayout={(e: LayoutChangeEvent) => setBarHeight(e.nativeEvent.layout.height)}>
          <CreateBar
            label={`Create squares · ${formatDollars(price)} a square`}
            detail={`${matchup} · locks ${lockLabel(game.scheduledTime)}`}
            onPress={handleCreate}
            disabled={total !== 100}
            busy={creating}
          />
        </View>
      )}

      {created && (
        <SentSheet
          testID="create-squares-created"
          title="Squares created"
          subtitle={created.notified.length > 0 ? `${joinNames(created.notified)} ${created.notified.length === 1 ? 'was' : 'were'} notified` : null}
        >
          <View style={[sheetStyles.summary, styles.createdCard]}>
            <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: GRID_DOTS }, (_, r) => (
                <View key={r} style={styles.gridRow}>
                  {Array.from({ length: GRID_DOTS }, (__, c) => (
                    <View key={c} style={styles.gridDot} />
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.createdText}>
              <Text style={styles.createdMatchup}>{created.matchup}</Text>
              <Text testID="create-squares-created-summary" style={styles.createdLine}>
                {formatDollars(created.price)} a square · 0 of {SQUARES_PER_GRID} taken
              </Text>
              <Text style={styles.createdLine}>Locks {created.lock}</Text>
            </View>
          </View>
          <TouchableOpacity testID="create-squares-pick" style={sheetStyles.primary} onPress={() => openGrid(created.id)} accessibilityRole="button">
            <Text style={sheetStyles.primaryText}>Pick your squares</Text>
          </TouchableOpacity>
          <View style={sheetStyles.row}>
            <TouchableOpacity testID="create-squares-done" style={sheetStyles.secondary} onPress={onBack} accessibilityRole="button">
              <Text style={sheetStyles.secondaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </SentSheet>
      )}

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
  listContent: {
    paddingBottom: spacing.lg,
  },
  barHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gameText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  gameTeams: {
    ...textStyles.h4,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  gameAt: {
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.normal,
  },
  gameWhen: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.successTint,
    borderRadius: spacing.radius.xl,
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.padding.sm,
  },
  noticeText: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  priceValue: {
    alignItems: 'center',
    flex: 1,
  },
  price: {
    ...textStyles.h2,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  pot: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  potAmount: {
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },
  payoutTab: {
    height: spacing[10],
  },
  bars: {
    flexDirection: 'row',
    marginTop: spacing.padding.sm,
  },
  barCell: {
    minWidth: 0,
  },
  barGap: {
    marginLeft: spacing.xs,
  },
  bar: {
    height: spacing.xs + spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  barFinal: {
    backgroundColor: colors.primary,
  },
  barLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs + spacing.xs / 2,
  },
  barAmount: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.normal,
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
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    minHeight: spacing[16],
    marginTop: spacing.padding.sm,
  },
  addDetails: {
    marginTop: spacing.padding.sm,
  },
  createdCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grid: {
    marginRight: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.radius.xs,
    backgroundColor: colors.surfaceElevated,
    margin: 1,
  },
  createdText: {
    flex: 1,
  },
  createdMatchup: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  createdLine: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
