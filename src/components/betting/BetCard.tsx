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
import { formatCurrency } from '../../utils/formatting';

export interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  variant?: 'default' | 'live' | 'compact';
}

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
  variant = 'default',
}) => {
  const handlePress = () => {
    onPress?.(bet);
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
  const totalPot = bet.participants?.reduce((sum, p) => sum + p.amount, 0) || bet.totalPot || 0;
  
  // Find user's side from participants
  const userParticipant = bet.participants?.find(p => p.userId === '1'); // Mock user ID
  const userSide = userParticipant?.side;
  const userOdds = userSide && bet.odds ? 
    (userSide === 'A' ? bet.odds.sideA : bet.odds.sideB) : null;

  const cardStyle = [
    styles.card,
    isLive && styles.liveCard,
    variant === 'compact' && styles.compactCard,
  ];
  
  // Status indicator animation for live bets
  const getStatusIndicator = () => {
    switch (bet.status) {
      case 'LIVE':
        return <View style={[styles.statusIndicator, styles.liveIndicator]} />;
      case 'PENDING_RESOLUTION':
        return <View style={[styles.statusIndicator, styles.pendingIndicator]} />;
      case 'ACTIVE':
        return <View style={[styles.statusIndicator, styles.activeIndicator]} />;
      default:
        return <View style={[styles.statusIndicator, styles.defaultIndicator]} />;
    }
  };

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={handlePress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      {/* Header with Status and Total Pot */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {getStatusIndicator()}
          <Text style={styles.statusLabel}>
            {getStatusText(bet.status).replace('_', ' ')}
          </Text>
        </View>
        
        <View style={styles.potContainer}>
          <Text style={styles.potAmount}>{formatCurrency(totalPot, 'USD', false)}</Text>
          <Text style={styles.potLabel}>TOTAL POT</Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <View style={styles.contentLeft}>
          <Text style={styles.title} numberOfLines={1}>
            {bet.title}
          </Text>
          <Text style={styles.description} numberOfLines={1}>
            {bet.description}
          </Text>
        </View>
      </View>

      {/* Footer with User Pick and Participants */}
      <View style={styles.footer}>
        <View style={styles.footerContent}>
          <View style={styles.userPickSection}>
            {userSide && (
              <>
                <Text style={styles.userPickLabel}>Your Pick: </Text>
                <Text style={styles.userPickValue}>{userSide}</Text>
                {userOdds && (
                  <Text style={styles.userOddsValue}>
                    {userOdds > 0 ? `+${userOdds}` : userOdds.toString()}
                  </Text>
                )}
              </>
            )}
          </View>
          
          <View style={styles.participantSection}>
            <Text style={styles.participantIcon}>👥</Text>
            <Text style={styles.participantCount}>
              {participantCount} PLAYERS
            </Text>
          </View>
        </View>
      </View>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  liveIndicator: {
    backgroundColor: colors.live,
  },
  pendingIndicator: {
    backgroundColor: colors.pending,
  },
  activeIndicator: {
    backgroundColor: colors.active,
  },
  defaultIndicator: {
    backgroundColor: colors.textMuted,
  },
  statusLabel: {
    ...textStyles.status,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  potContainer: {
    alignItems: 'flex-end',
    marginLeft: spacing.md,
  },
  potAmount: {
    ...textStyles.balance,
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  potLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  
  // Main Content
  mainContent: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  contentLeft: {
    flex: 1,
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
  
  // Footer
  footer: {
    marginTop: spacing.xs,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userPickSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userPickLabel: {
    ...textStyles.bodySmall,
    color: colors.textMuted,
    fontSize: 12,
  },
  userPickValue: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    marginRight: spacing.xs,
  },
  userOddsValue: {
    ...textStyles.bodySmall,
    color: colors.active,
    fontFamily: typography.fontFamily.mono,
    fontWeight: typography.fontWeight.bold,
  },
  participantSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantIcon: {
    fontSize: 10,
    marginRight: 4,
  },
  participantCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
});