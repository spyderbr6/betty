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
import { oddsUtils } from '../../utils/odds';
import { formatCurrency, dateFormatting } from '../../utils/formatting';

interface LiveBetCardProps {
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
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for live indicator
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

    // Glow animation for card border
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );

    pulseAnimation.start();
    glowAnimation.start();

    return () => {
      pulseAnimation.stop();
      glowAnimation.stop();
    };
  }, []);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleQuickBet = (side: string) => {
    onQuickBet?.(bet, side);
  };

  const participantCount = bet.participants?.length || 0;

  // Animated glow border color
  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.live, colors.livePulse],
  });

  return (
    <Animated.View style={[styles.container, { borderColor }]}>
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
            <Text style={styles.potAmount}>{formatCurrency(bet.totalPot, 'USD', false)}</Text>
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
              <Text style={[
                styles.quickBetOdds,
                { color: oddsUtils.getOddsColor(bet.odds.sideA) === 'positive' ? colors.oddsPositive : colors.oddsNegative }
              ]}>
                {oddsUtils.formatAmerican(bet.odds.sideA)}
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
              <Text style={[
                styles.quickBetOdds,
                { color: oddsUtils.getOddsColor(bet.odds.sideB) === 'positive' ? colors.oddsPositive : colors.oddsNegative }
              ]}>
                {oddsUtils.formatAmerican(bet.odds.sideB)}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.betting.cardGap / 2,
    marginHorizontal: spacing.md,
    borderRadius: spacing.radius.lg,
    borderWidth: 2,
    ...shadows.liveBetCard,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg - 2, // Account for border
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
    ...textStyles.pot,
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
    gap: spacing.sm,
  },
  quickBetButton: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: spacing.radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBetButtonA: {
    // Could add side-specific styling
  },
  quickBetButtonB: {
    // Could add side-specific styling
  },
  quickBetSide: {
    ...textStyles.label,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'center',
  },
  quickBetOdds: {
    ...textStyles.odds,
    fontWeight: typography.fontWeight.bold,
  },
  quickBetDivider: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
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