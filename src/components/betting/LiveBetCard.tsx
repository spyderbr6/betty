/**
 * LiveBetCard Component
 * Special card for live betting with real-time updates and animations
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { colors, typography, spacing, shadows, textStyles } from '../../styles';
import { Bet } from '../../types/betting';
import { formatCurrency, dateFormatting } from '../../utils/formatting';

export interface LiveBetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  onQuickBet?: (bet: Bet, side: string) => void;
  showQuickBet?: boolean;
}

export const LiveBetCard: React.FC<LiveBetCardProps> = ({
  bet,
  onPress,
  onQuickBet,
  showQuickBet = true,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [pulseAnim]);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleQuickBet = (side: string) => {
    onQuickBet?.(bet, side);
  };

  const participantCount = bet.participants?.length || 0;
  const totalPot = bet.participants?.reduce((sum, p) => sum + p.amount, 0) || bet.totalPot || 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        disabled={!onPress}
        activeOpacity={0.9}
      >
        {/* Live Header */}
        <View style={styles.header}>
          <View style={styles.liveContainer}>
            <Animated.View 
              style={[
                styles.liveIndicator,
                { transform: [{ scale: pulseAnim }] }
              ]}
            />
            <Text style={styles.liveText}>LIVE</Text>
            <View style={styles.liveDot} />
            <Text style={styles.eventDetails}>
              {bet.category} • {dateFormatting.formatRelativeTime(bet.createdAt)}
            </Text>
          </View>
          
          <View style={styles.potContainer}>
            <Text style={styles.potAmount}>{formatCurrency(totalPot, 'USD', false)}</Text>
            <Text style={styles.potLabel}>TOTAL POT</Text>
          </View>
        </View>

        {/* Event Title */}
        <Text style={styles.title} numberOfLines={2}>
          {bet.title}
        </Text>
        
        <Text style={styles.description} numberOfLines={1}>
          {bet.description}
        </Text>

        {/* Live Stats Bar */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{participantCount}</Text>
            <Text style={styles.statLabel}>LIVE BETS</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>03:42</Text>
            <Text style={styles.statLabel}>TIME LEFT</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>68%</Text>
            <Text style={styles.statLabel}>CONFIDENCE</Text>
          </View>
        </View>

        {/* Quick Bet Options */}
        {showQuickBet && bet.odds && (
          <View style={styles.quickBetContainer}>
            <TouchableOpacity
              style={[styles.quickBetButton, styles.quickBetButtonA]}
              onPress={() => handleQuickBet('A')}
            >
              <Text style={styles.quickBetSide} numberOfLines={1}>
                {bet.odds.sideAName || 'Side A'}
              </Text>
            </TouchableOpacity>
            
            <View style={styles.quickBetDivider}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.quickBetButton, styles.quickBetButtonB]}
              onPress={() => handleQuickBet('B')}
            >
              <Text style={styles.quickBetSide} numberOfLines={1}>
                {bet.odds.sideBName || 'Side B'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Live Activity Indicator */}
        <View style={styles.activityContainer}>
          <View style={styles.activityDots}>
            <Animated.View style={[styles.activityDot, { opacity: pulseAnim }]} />
            <View style={styles.activityDot} />
            <View style={styles.activityDot} />
          </View>
          <Text style={styles.activityText}>Live betting active</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.betting.cardGap / 2,
    marginHorizontal: spacing.md,
    borderRadius: spacing.radius.lg,
    borderWidth: 2,
    borderColor: colors.live,
    ...shadows.betCard,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg - 2,
    padding: spacing.betting.cardPadding,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  liveIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.live,
    marginRight: spacing.xs,
  },
  liveText: {
    ...textStyles.status,
    color: colors.live,
    fontWeight: typography.fontWeight.bold,
    marginRight: spacing.xs,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginHorizontal: spacing.xs,
  },
  eventDetails: {
    ...textStyles.caption,
    color: colors.textMuted,
    flex: 1,
  },
  potContainer: {
    alignItems: 'flex-end',
  },
  potAmount: {
    ...textStyles.balance,
    color: colors.primary,
    fontSize: typography.fontSize.xl,
  },
  potLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  
  // Content
  title: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  
  // Stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  
  // Quick Bet
  quickBetContainer: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    // gap is not supported on native; use margins on children
  },
  quickBetButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBetButtonA: {
    // Left button spacing
    marginRight: spacing.sm,
  },
  quickBetButtonB: {
    // Right button spacing
    marginLeft: spacing.sm,
  },
  quickBetSide: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'center',
  },
  quickBetOdds: {
    ...textStyles.button,
    fontWeight: typography.fontWeight.bold,
  },
  quickBetDivider: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginHorizontal: spacing.xs,
  },
  vsText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
  },
  
  // Activity
  activityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityDots: {
    flexDirection: 'row',
    marginRight: spacing.xs,
  },
  activityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.live,
    marginHorizontal: 1,
  },
  activityText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
});
