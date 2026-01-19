/**
 * SquaresGameDetailScreen
 *
 * Main screen for viewing and purchasing squares in a squares game.
 * Shows the grid, game info, purchase flow, and winners.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { useAuth } from '../contexts/AuthContext';
import { SquaresGrid } from '../components/betting/SquaresGrid';
import { PurchaseSquaresModal } from '../components/modals/PurchaseSquaresModal';
import { colors, spacing, typography, textStyles, shadows } from '../styles';
import { formatCurrency, formatDateTime } from '../utils/formatting';
import { showAlert } from '../components/ui/CustomAlert';
import { SquaresGameService } from '../services/squaresGameService';

const client = generateClient<Schema>();

export const SquaresGameDetailScreen = ({ route, navigation }: any) => {
  const { gameId } = route.params; // Changed from squaresGameId to match navigation
  const { user } = useAuth();

  const [game, setGame] = useState<any>(null);
  const [event, setEvent] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [selectedSquares, setSelectedSquares] = useState<Array<{ row: number; col: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);

  // Load game data
  const loadGameData = useCallback(async () => {
    try {
      // Get game
      const { data: gameData } = await client.models.SquaresGame.get({ id: gameId });
      if (!gameData) {
        showAlert('Game Not Found', 'This squares game could not be found.');
        navigation.goBack();
        return;
      }
      setGame(gameData);

      // Get event
      const { data: eventData } = await client.models.LiveEvent.get({ id: gameData.eventId });
      setEvent(eventData);

      // Get purchases
      const { data: purchasesData } = await client.models.SquaresPurchase.purchasesBySquaresGame({
        squaresGameId: gameId,
      });
      setPurchases(purchasesData || []);

      // Get payouts
      const { data: payoutsData } = await client.models.SquaresPayout.payoutsBySquaresGame({
        squaresGameId: gameId,
      });
      setPayouts(payoutsData || []);
    } catch (error) {
      console.error('Error loading game data:', error);
      showAlert('Error', 'Failed to load game data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gameId, navigation]);

  useEffect(() => {
    loadGameData();
  }, [loadGameData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadGameData();
  };

  const handleSquarePress = (row: number, col: number) => {
    const isSelected = selectedSquares.some((s) => s.row === row && s.col === col);

    if (isSelected) {
      // Deselect
      setSelectedSquares(selectedSquares.filter((s) => !(s.row === row && s.col === col)));
    } else {
      // Select
      setSelectedSquares([...selectedSquares, { row, col }]);
    }
  };

  const handleBuySquares = () => {
    if (selectedSquares.length === 0) {
      showAlert('No Squares Selected', 'Please select at least one square to purchase.');
      return;
    }

    if (!user) {
      showAlert('Authentication Required', 'Please log in to purchase squares.');
      return;
    }

    setPurchaseModalVisible(true);
  };

  const handleConfirmPurchase = async (ownerName: string) => {
    if (!user) return;

    try {
      await SquaresGameService.purchaseSquares({
        squaresGameId: game.id,
        userId: user.userId,
        ownerName,
        squares: selectedSquares,
      });

      // Success
      setPurchaseModalVisible(false);
      setSelectedSquares([]);
      showAlert(
        'Purchase Successful',
        `Successfully purchased ${selectedSquares.length} square${selectedSquares.length > 1 ? 's' : ''} for ${ownerName}!`
      );

      // Refresh data
      loadGameData();
    } catch (error) {
      throw error; // Let modal handle the error
    }
  };

  const myPurchases = purchases.filter((p) => p.userId === user?.userId);

  // Group purchases by owner name
  const groupByOwnerName = (purchasesList: any[]) => {
    const grouped: Record<string, any[]> = {};
    purchasesList.forEach((p) => {
      if (!grouped[p.ownerName]) {
        grouped[p.ownerName] = [];
      }
      grouped[p.ownerName].push(p);
    });
    return grouped;
  };

  const getPeriodLabel = (period: string) => {
    switch (period) {
      case 'PERIOD_1':
        return 'Period 1';
      case 'PERIOD_2':
        return 'Halftime';
      case 'PERIOD_3':
        return 'Period 3';
      case 'PERIOD_4':
        return 'Final';
      case 'PERIOD_5':
        return 'Overtime';
      case 'PERIOD_6':
        return '2nd OT';
      default:
        return period;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!game || !event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Game not found</Text>
      </View>
    );
  }

  const editable = game.status === 'ACTIVE' || game.status === 'SETUP';
  const totalInvested = myPurchases.length * game.pricePerSquare;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={2}>
            {game.title}
          </Text>
        </View>

        {/* Event Info */}
        <View style={styles.eventCard}>
          <Text style={styles.eventTeams}>
            {event.awayTeamCode || event.awayTeam} @ {event.homeTeamCode || event.homeTeam}
          </Text>
          <Text style={styles.eventTime}>{formatDateTime(event.scheduledTime)}</Text>
          {event.venue && (
            <Text style={styles.eventVenue}>
              {event.venue}
              {event.city && `, ${event.city}`}
            </Text>
          )}
        </View>

        {/* Game Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Price Per Square</Text>
            <Text style={styles.statValue}>{formatCurrency(game.pricePerSquare)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Squares Sold</Text>
            <Text style={styles.statValue}>{game.squaresSold}/100</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Pot</Text>
            <Text style={styles.statValue}>{formatCurrency(game.totalPot)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Status</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>{game.status}</Text>
          </View>
        </View>

        {/* Payout Structure */}
        <View style={styles.payoutCard}>
          <Text style={styles.cardTitle}>Prize Breakdown</Text>
          {Object.entries(
            typeof game.payoutStructure === 'string'
              ? JSON.parse(game.payoutStructure)
              : game.payoutStructure
          ).map(([period, percentage]: [string, any]) => {
            const periodNum = parseInt(period.replace('period', ''));
            const amount = game.totalPot * percentage;
            const netAmount = amount * 0.97; // After 3% fee

            return (
              <View key={period} style={styles.payoutRow}>
                <Text style={styles.payoutPeriod}>{getPeriodLabel(`PERIOD_${periodNum}`)}</Text>
                <Text style={styles.payoutPercentage}>{(percentage * 100).toFixed(0)}%</Text>
                <Text style={styles.payoutAmount}>{formatCurrency(netAmount)}</Text>
              </View>
            );
          })}
          <Text style={styles.feeNote}>* Amounts shown after 3% platform fee</Text>
        </View>

        {/* THE GRID */}
        <SquaresGrid
          game={game}
          purchases={purchases}
          selectedSquares={selectedSquares}
          onSquarePress={handleSquarePress}
          editable={editable}
          currentUserId={user?.userId}
          homeTeamCode={event.homeTeamCode}
          awayTeamCode={event.awayTeamCode}
        />

        {/* Period Scores (for LIVE/RESOLVED games) */}
        {(game.status === 'LIVE' || game.status === 'RESOLVED' || game.status === 'PENDING_RESOLUTION') && event.homePeriodScores && event.awayPeriodScores && (
          <View style={styles.periodScoresCard}>
            <Text style={styles.cardTitle}>Period Scores</Text>
            {(() => {
              const homeScores = typeof event.homePeriodScores === 'string'
                ? JSON.parse(event.homePeriodScores)
                : event.homePeriodScores;
              const awayScores = typeof event.awayPeriodScores === 'string'
                ? JSON.parse(event.awayPeriodScores)
                : event.awayPeriodScores;

              const periods = Math.max(homeScores.length, awayScores.length);

              return Array.from({ length: periods }, (_, i) => {
                const periodNum = i + 1;
                const homeScore = homeScores[i] || 0;
                const awayScore = awayScores[i] || 0;
                const periodLabel = getPeriodLabel(`PERIOD_${periodNum}`);

                // Find if there's a payout for this period
                const periodPayout = payouts.find((p) => p.period === `PERIOD_${periodNum}`);

                return (
                  <View key={i} style={styles.periodScoreRow}>
                    <Text style={styles.periodScoreLabel}>{periodLabel}</Text>
                    <View style={styles.scoreDisplay}>
                      <Text style={styles.scoreTeam}>
                        {event.awayTeamCode || event.awayTeam}: {awayScore}
                      </Text>
                      <Text style={styles.scoreTeam}>
                        {event.homeTeamCode || event.homeTeam}: {homeScore}
                      </Text>
                    </View>
                    {periodPayout && (
                      <View style={styles.periodWinnerBadge}>
                        <Text style={styles.periodWinnerText}>
                          🏆 {periodPayout.ownerName}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              });
            })()}
          </View>
        )}

        {/* My Squares Summary */}
        {myPurchases.length > 0 && (
          <View style={styles.mySquaresCard}>
            <Text style={styles.cardTitle}>Squares I Purchased ({myPurchases.length})</Text>

            {Object.entries(groupByOwnerName(myPurchases)).map(([ownerName, purchasesList]) => (
              <View key={ownerName} style={styles.ownerGroup}>
                <Text style={styles.ownerLabel}>{ownerName}</Text>
                <View style={styles.squaresList}>
                  {purchasesList.map((purchase) => (
                    <View key={purchase.id} style={styles.squareChip}>
                      {game.numbersAssigned ? (
                        <Text style={styles.squareChipText}>
                          {game.colNumbers[purchase.gridCol]}-{game.rowNumbers[purchase.gridRow]}
                        </Text>
                      ) : (
                        <Text style={styles.squareChipText}>
                          ({purchase.gridCol}, {purchase.gridRow})
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <View style={styles.investmentSummary}>
              <Text style={styles.investmentLabel}>Total Invested:</Text>
              <Text style={styles.investmentAmount}>{formatCurrency(totalInvested)}</Text>
            </View>
          </View>
        )}

        {/* Period Winners */}
        {payouts.length > 0 && (
          <View style={styles.winnersCard}>
            <Text style={styles.cardTitle}>Winners</Text>
            {payouts.map((payout) => {
              const isSelfOwned = payout.userId === user?.userId;

              return (
                <View key={payout.id} style={styles.winnerRow}>
                  <View style={styles.winnerPeriod}>
                    <Text style={styles.periodLabel}>{getPeriodLabel(payout.period)}</Text>
                    <Text style={styles.scoreLabel}>
                      {payout.awayScoreFull} - {payout.homeScoreFull}
                    </Text>
                  </View>

                  <View style={styles.winnerDetails}>
                    <Text style={styles.winnerName}>{payout.ownerName}</Text>
                    {isSelfOwned && <Text style={styles.yourSquareBadge}>You bought this</Text>}
                  </View>

                  <Text style={styles.winnerAmount}>{formatCurrency(payout.amount)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      {editable && (
        <View style={styles.footer}>
          {selectedSquares.length > 0 && (
            <View style={styles.selectionSummary}>
              <Text style={styles.selectionText}>{selectedSquares.length} squares selected</Text>
              <Text style={styles.selectionCost}>
                {formatCurrency(selectedSquares.length * game.pricePerSquare)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.buyButton, selectedSquares.length === 0 && styles.buyButtonDisabled]}
            onPress={handleBuySquares}
            disabled={selectedSquares.length === 0}
          >
            <Text style={styles.buyButtonText}>
              {selectedSquares.length > 0
                ? `Buy ${selectedSquares.length} Square${selectedSquares.length > 1 ? 's' : ''}`
                : 'Select Squares to Purchase'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Purchase Modal */}
      <PurchaseSquaresModal
        visible={purchaseModalVisible}
        onClose={() => setPurchaseModalVisible(false)}
        game={game}
        selectedSquares={selectedSquares}
        onConfirmPurchase={handleConfirmPurchase}
        userDisplayName={user?.displayName || user?.username}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    ...textStyles.body,
    color: colors.error,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.md,
  },
  backButton: {
    marginBottom: spacing.sm,
  },
  backButtonText: {
    ...textStyles.body,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
  },
  eventCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eventTeams: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  eventTime: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  eventVenue: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  statsCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    marginBottom: spacing.sm,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  statValue: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  payoutCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  payoutPeriod: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  payoutPercentage: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginHorizontal: spacing.sm,
  },
  payoutAmount: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  feeNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  periodScoresCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  periodScoreRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodScoreLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs / 2,
  },
  scoreDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs / 2,
  },
  scoreTeam: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  periodWinnerBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    alignSelf: 'flex-start',
    marginTop: spacing.xs / 2,
  },
  periodWinnerText: {
    ...textStyles.caption,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  mySquaresCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  ownerGroup: {
    marginBottom: spacing.md,
  },
  ownerLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  squaresList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  squareChip: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  squareChipText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  investmentSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  investmentLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  investmentAmount: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  winnersCard: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  winnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  winnerPeriod: {
    flex: 1,
  },
  periodLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  scoreLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  winnerDetails: {
    flex: 1,
    alignItems: 'center',
  },
  winnerName: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  yourSquareBadge: {
    ...textStyles.caption,
    color: colors.success,
    fontSize: typography.fontSize.xs,
  },
  winnerAmount: {
    ...textStyles.h4,
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectionSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  selectionText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  selectionCost: {
    ...textStyles.h4,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  buyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: colors.textMuted,
    opacity: 0.5,
  },
  buyButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  creatorActions: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelButton: {
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cancelButtonText: {
    ...textStyles.body,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.semibold,
  },
  cancelHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
