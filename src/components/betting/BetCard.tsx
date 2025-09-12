/**
 * BetCard Component
 * Clean bet card matching the exact sportsbook mockup design
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, typography, spacing, textStyles } from '../../styles';
import { Bet, BetStatus } from '../../types/betting';
import { formatCurrency } from '../../utils/formatting';

export interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  variant?: 'default' | 'compact';
}

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
}) => {
  const handlePress = () => {
    onPress?.(bet);
  };

  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'LIVE':
        return colors.live;
      case 'ACTIVE':
        return colors.success;
      case 'PENDING_RESOLUTION':
        return colors.warning;
      case 'RESOLVED':
        return colors.success;
      case 'CANCELLED':
        return colors.error;
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
  const totalPot = bet.participants?.reduce((sum, p) => sum + p.amount, 0) || bet.totalPot || 0;
  const statusColor = getStatusColor(bet.status);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: statusColor }]}
      onPress={handlePress}
      disabled={!onPress}
      activeOpacity={0.8}
    >
      {/* Status Badge */}
      <View style={styles.statusContainer}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{getStatusText(bet.status)}</Text>
        </View>
        
        {/* Pot Amount - Top Right */}
        <View style={styles.potContainer}>
          <Text style={styles.potAmount}>
            {formatCurrency(totalPot, 'USD', false)}
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {bet.title}
        </Text>
        <Text style={styles.description} numberOfLines={1}>
          {bet.description}
        </Text>
      </View>

      {/* Bottom Section - Participants */}
      <View style={styles.bottomSection}>
        <View style={styles.participantInfo}>
          <Text style={styles.participantIcon}>👥</Text>
          <Text style={styles.participantCount}>
            {participantCount} PLAYERS
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  
  // Status Container (Top Row)
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    alignSelf: 'flex-start',
  },
  statusText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  potContainer: {
    alignItems: 'flex-end',
  },
  potAmount: {
    ...textStyles.pot,
    color: colors.warning,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  
  // Main Content
  content: {
    marginBottom: spacing.sm,
  },
  title: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 2,
  },
  description: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  // Bottom Section
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  participantCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
});