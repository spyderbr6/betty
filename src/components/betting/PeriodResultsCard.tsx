/**
 * PeriodResultsCard
 *
 * Consolidated component showing period-by-period results for squares games.
 * Combines prize breakdown, scores, and winners into a single unified list.
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Period Results</Text>

      {/* Period Rows */}
      {periods.map((period, index) => {
        const isLastRow = index === periods.length - 1;
        const hasPayout = !!period.payout;
        const hasScore = period.homeScore !== null && period.awayScore !== null;

        return (
          <View
            key={period.periodKey}
            style={[
              styles.periodRow,
              !isLastRow && styles.periodRowBorder,
              period.isCurrentUser && styles.periodRowYou,
            ]}
          >
            {/* Top Line: Period · Winner + Prize */}
            <View style={styles.topLine}>
              <View style={styles.periodAndWinner}>
                <Text style={styles.periodLabel}>{period.label}</Text>
                {hasPayout && (
                  <>
                    <Text style={styles.dotSeparator}>·</Text>
                    <Text
                      style={[
                        styles.winnerName,
                        period.isCurrentUser && styles.winnerNameYou,
                      ]}
                      numberOfLines={1}
                    >
                      {period.payout!.ownerName}
                    </Text>
                  </>
                )}
                {!hasPayout && !hasScore && (
                  <>
                    <Text style={styles.dotSeparator}>·</Text>
                    <Text style={styles.pendingText}>Pending</Text>
                  </>
                )}
              </View>
              <Text
                style={[
                  styles.prizeAmount,
                  hasPayout && styles.prizeAmountPaid,
                ]}
              >
                {formatCurrency(period.prizeAmount)}
              </Text>
            </View>

            {/* Bottom Line: Score + Status */}
            <View style={styles.bottomLine}>
              <Text style={styles.scoreText}>
                {hasScore
                  ? `Score: ${period.awayScore}-${period.homeScore}`
                  : `${(period.percentage * 100).toFixed(0)}% of pot`}
              </Text>
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
  // Period row
  periodRow: {
    paddingVertical: spacing.sm,
  },
  periodRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  periodRowYou: {
    backgroundColor: colors.success + '10',
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  // Top line
  topLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs / 2,
  },
  periodAndWinner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  periodLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  dotSeparator: {
    ...textStyles.body,
    color: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  winnerName: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
  },
  winnerNameYou: {
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
  pendingText: {
    ...textStyles.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  prizeAmount: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  prizeAmountPaid: {
    color: colors.success,
  },
  // Bottom line
  bottomLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  paidBadge: {
    ...textStyles.caption,
    color: colors.success,
    fontWeight: typography.fontWeight.semibold,
  },
});
