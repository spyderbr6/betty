/**
 * PeriodResultsCard
 *
 * Consolidated component showing period-by-period results for squares games.
 * Combines prize breakdown, scores, and winners into a single unified table.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, textStyles, shadows } from '../../styles';
import { formatCurrency } from '../../utils/formatting';

interface PeriodResultsCardProps {
  game: {
    status: string;
    totalPot: number;
    payoutStructure: string | Record<string, number>;
  };
  event: {
    homeTeamCode?: string;
    homeTeam?: string;
    awayTeamCode?: string;
    awayTeam?: string;
    homePeriodScores?: string | number[];
    awayPeriodScores?: string | number[];
  };
  payouts: Array<{
    id: string;
    period: string;
    ownerName: string;
    userId: string;
    amount: number;
    homeScoreFull: number;
    awayScoreFull: number;
  }>;
  currentUserId?: string;
}

const getPeriodLabel = (period: string): string => {
  switch (period) {
    case 'PERIOD_1':
      return 'Q1';
    case 'PERIOD_2':
      return 'Half';
    case 'PERIOD_3':
      return 'Q3';
    case 'PERIOD_4':
      return 'Final';
    case 'PERIOD_5':
      return 'OT';
    case 'PERIOD_6':
      return '2OT';
    default:
      return period;
  }
};

export const PeriodResultsCard: React.FC<PeriodResultsCardProps> = ({
  game,
  event,
  payouts,
  currentUserId,
}) => {
  // Parse payout structure
  const payoutStructure: Record<string, number> =
    typeof game.payoutStructure === 'string'
      ? JSON.parse(game.payoutStructure)
      : game.payoutStructure;

  // Parse period scores if available
  const homeScores: number[] =
    event.homePeriodScores
      ? typeof event.homePeriodScores === 'string'
        ? JSON.parse(event.homePeriodScores)
        : event.homePeriodScores
      : [];

  const awayScores: number[] =
    event.awayPeriodScores
      ? typeof event.awayPeriodScores === 'string'
        ? JSON.parse(event.awayPeriodScores)
        : event.awayPeriodScores
      : [];

  // Determine if we should show scores (game is live or finished)
  const showScores =
    game.status === 'LIVE' ||
    game.status === 'RESOLVED' ||
    game.status === 'PENDING_RESOLUTION';

  // Build period data from payout structure
  const periods = Object.entries(payoutStructure).map(([key, percentage]) => {
    const periodNum = parseInt(key.replace('period', ''));
    const periodKey = `PERIOD_${periodNum}`;
    const payout = payouts.find((p) => p.period === periodKey);

    // Calculate cumulative scores up to this period
    let homeScore: number | null = null;
    let awayScore: number | null = null;

    if (showScores && homeScores.length >= periodNum && awayScores.length >= periodNum) {
      homeScore = homeScores.slice(0, periodNum).reduce((sum, s) => sum + s, 0);
      awayScore = awayScores.slice(0, periodNum).reduce((sum, s) => sum + s, 0);
    }

    // Prize amount (gross, before fees)
    const prizeAmount = game.totalPot * percentage;

    return {
      periodNum,
      periodKey,
      label: getPeriodLabel(periodKey),
      percentage,
      prizeAmount,
      homeScore,
      awayScore,
      payout,
      isCurrentUser: payout?.userId === currentUserId,
    };
  });

  const awayTeam = event.awayTeamCode || event.awayTeam || 'Away';
  const homeTeam = event.homeTeamCode || event.homeTeam || 'Home';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Period Results</Text>

      {/* Table Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.periodCol]}>Period</Text>
        <Text style={[styles.headerCell, styles.scoreCol]}>Score</Text>
        <Text style={[styles.headerCell, styles.winnerCol]}>Winner</Text>
        <Text style={[styles.headerCell, styles.prizeCol]}>Prize</Text>
      </View>

      {/* Table Rows */}
      {periods.map((period, index) => {
        const isLastRow = index === periods.length - 1;
        const hasPayout = !!period.payout;

        return (
          <View
            key={period.periodKey}
            style={[styles.dataRow, !isLastRow && styles.dataRowBorder]}
          >
            {/* Period */}
            <Text style={[styles.dataCell, styles.periodCol, styles.periodText]}>
              {period.label}
            </Text>

            {/* Score */}
            <View style={[styles.scoreCol, styles.scoreContainer]}>
              {period.homeScore !== null && period.awayScore !== null ? (
                <Text style={styles.scoreText}>
                  {period.awayScore}-{period.homeScore}
                </Text>
              ) : (
                <Text style={styles.emptyText}>—</Text>
              )}
            </View>

            {/* Winner */}
            <View style={[styles.winnerCol, styles.winnerContainer]}>
              {hasPayout ? (
                <View
                  style={[
                    styles.winnerNameBox,
                    period.isCurrentUser && styles.winnerNameBoxYou,
                  ]}
                >
                  <Text
                    style={[
                      styles.winnerText,
                      period.isCurrentUser && styles.winnerTextHighlight,
                    ]}
                    numberOfLines={1}
                  >
                    {period.payout!.ownerName}
                  </Text>
                </View>
              ) : (
                <Text style={styles.emptyText}>—</Text>
              )}
            </View>

            {/* Prize */}
            <View style={[styles.prizeCol, styles.prizeContainer]}>
              <Text
                style={[
                  styles.prizeText,
                  hasPayout && styles.prizeTextPaid,
                ]}
              >
                {formatCurrency(period.prizeAmount)}
              </Text>
              {!hasPayout && (
                <Text style={styles.percentageText}>
                  {(period.percentage * 100).toFixed(0)}%
                </Text>
              )}
              {hasPayout && <Text style={styles.paidBadge}>Paid</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    ...shadows.card,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  title: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  headerCell: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dataRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dataCell: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  // Column widths
  periodCol: {
    width: 50,
  },
  scoreCol: {
    width: 60,
  },
  winnerCol: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  prizeCol: {
    width: 70,
    alignItems: 'flex-end',
  },
  // Period
  periodText: {
    fontWeight: typography.fontWeight.semibold,
  },
  // Score
  scoreContainer: {
    justifyContent: 'center',
  },
  scoreText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
  },
  // Winner
  winnerContainer: {
    justifyContent: 'center',
  },
  winnerNameBox: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: spacing.radius.sm,
    alignSelf: 'flex-start',
  },
  winnerNameBoxYou: {
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: colors.success + '15',
  },
  winnerText: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  winnerTextHighlight: {
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  // Prize
  prizeContainer: {
    alignItems: 'flex-end',
  },
  prizeText: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  prizeTextPaid: {
    color: colors.success,
  },
  percentageText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },
  paidBadge: {
    ...textStyles.caption,
    color: colors.success,
    fontSize: typography.fontSize.xs,
  },
  // Empty state
  emptyText: {
    ...textStyles.body,
    color: colors.textMuted,
  },
});
