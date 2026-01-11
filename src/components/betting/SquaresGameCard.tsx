/**
 * SquaresGameCard Component
 *
 * Compact card for displaying squares games in list views (Home feed, My Bets, etc.)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, textStyles, commonStyles, shadows } from '../../styles';
import { formatCurrency, formatDateTime } from '../../utils/formatting';

interface SquaresGameCardProps {
  squaresGame: any;
  event?: any;
  onPress: () => void;
  compact?: boolean;
}

export const SquaresGameCard: React.FC<SquaresGameCardProps> = ({
  squaresGame,
  event,
  onPress,
  compact = false,
}) => {
  // Calculate availability
  const squaresAvailable = 100 - squaresGame.squaresSold;
  const percentageSold = (squaresGame.squaresSold / 100) * 100;

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'SETUP':
        return colors.success;
      case 'LOCKED':
        return colors.warning;
      case 'LIVE':
        return colors.live;
      case 'RESOLVED':
        return colors.textSecondary;
      case 'CANCELLED':
        return colors.error;
      default:
        return colors.textMuted;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'SETUP':
        return 'Setting Up';
      case 'ACTIVE':
        return 'Open';
      case 'LOCKED':
        return 'Locked';
      case 'LIVE':
        return 'LIVE';
      case 'RESOLVED':
        return 'Complete';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.compactCard]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {squaresGame.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(squaresGame.status) }]}>
          <Text style={styles.statusText}>{getStatusText(squaresGame.status)}</Text>
        </View>
      </View>

      {/* Event Info */}
      {event && (
        <View style={styles.eventInfo}>
          <Text style={styles.eventTeams} numberOfLines={1}>
            {event.awayTeamCode || event.awayTeam} @ {event.homeTeamCode || event.homeTeam}
          </Text>
          <Text style={styles.eventTime}>{formatDateTime(event.scheduledTime, 'short')}</Text>
        </View>
      )}

      {/* Progress Bar (if active) */}
      {(squaresGame.status === 'ACTIVE' || squaresGame.status === 'SETUP') && (
        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${percentageSold}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {squaresGame.squaresSold}/100 sold
          </Text>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Price</Text>
          <Text style={styles.statValue}>{formatCurrency(squaresGame.pricePerSquare)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Available</Text>
          <Text style={styles.statValue}>
            {squaresGame.status === 'ACTIVE' || squaresGame.status === 'SETUP'
              ? `${squaresAvailable}`
              : '-'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Total Pot</Text>
          <Text style={styles.statValue}>{formatCurrency(squaresGame.totalPot)}</Text>
        </View>
      </View>

      {/* Action Button (if active) */}
      {squaresGame.status === 'ACTIVE' && !compact && (
        <TouchableOpacity style={styles.buyButton} onPress={onPress}>
          <Text style={styles.buyButtonText}>View & Buy Squares</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    ...commonStyles.betCard,
    ...shadows.card,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  compactCard: {
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...textStyles.h4,
    flex: 1,
    marginRight: spacing.sm,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
  },
  eventInfo: {
    marginBottom: spacing.sm,
  },
  eventTeams: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  eventTime: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  progressSection: {
    marginBottom: spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: spacing.radius.xs,
    overflow: 'hidden',
    marginBottom: spacing.xs / 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.success,
  },
  progressText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: spacing.lg,
    backgroundColor: colors.border,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.xs / 2,
  },
  statValue: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  buyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buyButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
});
