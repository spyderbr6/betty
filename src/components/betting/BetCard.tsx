/**
 * BetCard Component
 * Clean bet card matching the exact sportsbook mockup design
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../../amplify/data/resource';
import { colors, typography, spacing, textStyles } from '../../styles';
import { Bet, BetStatus } from '../../types/betting';
import { formatCurrency } from '../../utils/formatting';
import { useAuth } from '../../contexts/AuthContext';

// Initialize GraphQL client
const client = generateClient<Schema>();

export interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  variant?: 'default' | 'compact';
  onJoinBet?: (betId: string, side: string, amount: number) => void;
  showJoinOptions?: boolean;
}

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
  onJoinBet,
  showJoinOptions = true,
}) => {
  const { user } = useAuth();
  const [isJoining, setIsJoining] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [userParticipation, setUserParticipation] = useState<{
    hasJoined: boolean;
    side: 'A' | 'B' | null;
    amount: number;
  }>({ hasJoined: false, side: null, amount: 0 });

  // Check if current user has joined this bet
  useEffect(() => {
    if (user && bet.participants) {
      const userParticipant = bet.participants.find(p => p.userId === user.userId);
      if (userParticipant) {
        setUserParticipation({
          hasJoined: true,
          side: userParticipant.side as 'A' | 'B',
          amount: userParticipant.amount,
        });
      } else {
        setUserParticipation({ hasJoined: false, side: null, amount: 0 });
      }
    }
  }, [user, bet.participants]);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleJoinBet = async (side: 'A' | 'B') => {
    if (isJoining) return;

    // For MVP, use a fixed amount of $10. In production, this would be user input
    const betAmount = 10;

    Alert.alert(
      'Join Bet',
      `Join "${bet.title}" with $${betAmount} on ${side === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Join', onPress: () => confirmJoinBet(side, betAmount) },
      ]
    );
  };

  const confirmJoinBet = async (side: 'A' | 'B', amount: number) => {
    setIsJoining(true);
    setSelectedSide(side);

    try {
      const user = await getCurrentUser();

      const result = await client.models.Participant.create({
        betId: bet.id,
        userId: user.userId,
        side: side,
        amount: amount,
        status: 'PENDING',
        payout: 0, // Will be calculated by backend
      });

      if (result.data) {
        Alert.alert(
          'Joined Successfully!',
          `You've joined the bet with $${amount} on ${side === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}.`,
          [{ text: 'OK' }]
        );

        // Call optional callback
        onJoinBet?.(bet.id, side, amount);
      } else {
        throw new Error('Failed to join bet');
      }
    } catch (error) {
      console.error('Error joining bet:', error);
      Alert.alert(
        'Error',
        'Failed to join bet. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsJoining(false);
      setSelectedSide(null);
    }
  };

  const formatOdds = (odds: number): string => {
    return odds > 0 ? `+${odds}` : odds.toString();
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

      {/* Betting Options */}
      {showJoinOptions && bet.status === 'ACTIVE' && (
        <View style={styles.bettingOptions}>
          {userParticipation.hasJoined ? (
            // Show joined status
            <View style={styles.joinedStatus}>
              <Text style={styles.joinedText}>
                ✓ You joined {userParticipation.side === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}
                with {formatCurrency(userParticipation.amount)}
              </Text>
            </View>
          ) : (
            // Show join options
            <>
              <TouchableOpacity
                style={[
                  styles.sideButton,
                  styles.sideButtonA,
                  isJoining && selectedSide === 'A' && styles.sideButtonLoading
                ]}
                onPress={() => handleJoinBet('A')}
                disabled={isJoining}
                activeOpacity={0.8}
              >
                {isJoining && selectedSide === 'A' ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <>
                    <Text style={styles.sideName}>
                      {bet.odds.sideAName || 'Side A'}
                    </Text>
                    <Text style={styles.sideOdds}>
                      {formatOdds(bet.odds.sideA)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.vsContainer}>
                <Text style={styles.vsText}>VS</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.sideButton,
                  styles.sideButtonB,
                  isJoining && selectedSide === 'B' && styles.sideButtonLoading
                ]}
                onPress={() => handleJoinBet('B')}
                disabled={isJoining}
                activeOpacity={0.8}
              >
                {isJoining && selectedSide === 'B' ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <>
                    <Text style={styles.sideName}>
                      {bet.odds.sideBName || 'Side B'}
                    </Text>
                    <Text style={styles.sideOdds}>
                      {formatOdds(bet.odds.sideB)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

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
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 2,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  
  // Betting Options
  bettingOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginHorizontal: -spacing.xs,
  },
  sideButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  sideButtonA: {
    marginRight: spacing.xs,
  },
  sideButtonB: {
    marginLeft: spacing.xs,
  },
  sideButtonLoading: {
    backgroundColor: colors.primary,
  },
  sideName: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 2,
    textAlign: 'center',
  },
  sideOdds: {
    ...textStyles.odds,
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
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