/**
 * BetCard Component
 * Professional bet card matching the sportsbook mockup design
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, typography, spacing, shadows, textStyles } from '../../styles';
import { Bet, BetStatus } from '../../types/betting';
import { oddsUtils } from '../../utils/odds';
import { formatCurrency, dateFormatting, formatParticipantCount } from '../../utils/formatting';

interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  showParticipants?: boolean;
  variant?: 'default' | 'live' | 'compact';
}

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
  showParticipants = true,
  variant = 'default',
}) => {
  const handlePress = () => {
    onPress?.(bet);
  };

  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'LIVE':
        return colors.live;
      case 'ACTIVE':
        return colors.active;
      case 'PENDING_RESOLUTION':
        return colors.pending;
      case 'RESOLVED':
        return colors.resolved;
      case 'CANCELLED':
        return colors.cancelled;
      default:
        return colors.textMuted;
    }
  };

  const getStatusText = (status: BetStatus): string => {
    switch (status) {
      case 'LIVE':
        return 'LIVE';
      case 'ACTIVE':
        return 'ACTIVE';
      case 'PENDING_RESOLUTION':
        return 'PENDING RESOLUTION';
      case 'RESOLVED':
        return 'RESOLVED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return status;
    }
  };

  const participantCount = bet.participants?.length || 0;
  const isLive = bet.status === 'LIVE';
  const isActive = bet.status === 'ACTIVE';

  const cardStyle = [
    styles.card,
    isLive && styles.liveCard,
    variant === 'compact' && styles.compactCard,
  ];

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={handlePress}
      disabled={!onPress}
      activeOpacity={0.8}
    >
      {/* Status Badge and Live Indicator */}
      <View style={styles.header}>
        <View style={styles.statusContainer}>
          {isLive && <View style={styles.liveIndicator} />}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(bet.status) }]}>
            <Text style={styles.statusText}>{getStatusText(bet.status)}</Text>
          </View>
          {bet.category && (
            <Text style={styles.categoryText}>{bet.category}</Text>
          )}
        </View>
        
        <View style={styles.potContainer}>
          <Text style={styles.potLabel}>TOTAL POT</Text>
          <Text style={styles.potAmount}>{formatCurrency(bet.totalPot, 'USD', false)}</Text>
        </View>
      </View>

      {/* Bet Title and Description */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {bet.title}
        </Text>
        
        {variant !== 'compact' && (
          <Text style={styles.description} numberOfLines={2}>
            {bet.description}
          </Text>
        )}

        {/* Odds Display */}
        {bet.odds && (
          <View style={styles.oddsContainer}>
            <View style={styles.oddsSide}>
              <Text style={styles.sideLabel}>
                {bet.odds.sideAName || 'Side A'}
              </Text>
              <Text style={[
                styles.oddsText,
                { color: oddsUtils.getOddsColor(bet.odds.sideA) === 'positive' ? colors.oddsPositive : colors.oddsNegative }
              ]}>
                {oddsUtils.formatAmerican(bet.odds.sideA)}
              </Text>
            </View>
            
            <Text style={styles.vsText}>VS</Text>
            
            <View style={styles.oddsSide}>
              <Text style={styles.sideLabel}>
                {bet.odds.sideBName || 'Side B'}
              </Text>
              <Text style={[
                styles.oddsText,
                { color: oddsUtils.getOddsColor(bet.odds.sideB) === 'positive' ? colors.oddsPositive : colors.oddsNegative }
              ]}>
                {oddsUtils.formatAmerican(bet.odds.sideB)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Footer with participants and deadline */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {showParticipants && (
            <View style={styles.participantInfo}>
              <Text style={styles.participantIcon}>👥</Text>
              <Text style={styles.participantCount}>
                {formatParticipantCount(participantCount).replace(' participants', '').replace(' participant', '')} PLAYERS
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.footerRight}>
          {(isActive || isLive) && (
            <View style={styles.deadlineContainer}>
              <Text style={styles.deadlineLabel}>
                {isLive ? 'LIVE' : dateFormatting.formatDeadline(bet.deadline)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* User's Pick (if participant) */}
      {bet.participants?.some(p => p.userId === 'current-user-id') && (
        <View style={styles.userPickContainer}>
          <Text style={styles.userPickLabel}>Your Pick:</Text>
          <Text style={styles.userPickSide}>
            {/* This would be dynamically determined */}
            Yes - {oddsUtils.formatAmerican(-110)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.betting.cardPadding,
    marginVertical: spacing.betting.cardGap / 2,
    marginHorizontal: spacing.md,
    ...shadows.betCard,
  },
  liveCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.live,
    ...shadows.liveBetCard,
  },
  compactCard: {
    padding: spacing.sm,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.live,
    marginRight: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    marginRight: spacing.xs,
  },
  statusText: {
    ...textStyles.status,
    color: colors.textPrimary,
    fontSize: 10,
  },
  categoryText: {
    ...textStyles.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  potContainer: {
    alignItems: 'flex-end',
  },
  potLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 2,
  },
  potAmount: {
    ...textStyles.pot,
    color: colors.primary,
  },
  
  // Content
  content: {
    marginBottom: spacing.sm,
  },
  title: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  
  // Odds
  oddsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    marginTop: spacing.xs,
  },
  oddsSide: {
    flex: 1,
    alignItems: 'center',
  },
  sideLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  oddsText: {
    ...textStyles.odds,
    fontWeight: typography.fontWeight.bold,
  },
  vsText: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginHorizontal: spacing.md,
    fontWeight: typography.fontWeight.bold,
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.xs,
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    alignItems: 'flex-end',
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantIcon: {
    fontSize: 12,
    marginRight: spacing.xs / 2,
  },
  participantCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  deadlineContainer: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  deadlineLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  
  // User Pick
  userPickContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20', // 20% opacity
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    marginTop: spacing.xs,
  },
  userPickLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  userPickSide: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
});