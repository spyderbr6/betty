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
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { Bet, BetStatus } from '../../types/betting';
import { formatCurrency, dateFormatting } from '../../utils/formatting';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationService } from '../../services/notificationService';
import { TransactionService } from '../../services/transactionService';

// Initialize GraphQL client
const client = generateClient<Schema>();

export interface BetCardProps {
  bet: Bet;
  onPress?: (bet: Bet) => void;
  variant?: 'default' | 'compact';
  onJoinBet?: (betId: string, side: string, amount: number) => void;
  showJoinOptions?: boolean;
  onInviteFriends?: (bet: Bet) => void;
}

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
  onJoinBet,
  showJoinOptions = true,
  onInviteFriends,
}) => {
  const { user } = useAuth();
  const [isJoining, setIsJoining] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [userParticipation, setUserParticipation] = useState<{
    hasJoined: boolean;
    side: 'A' | 'B' | null;
    amount: number;
  }>({ hasJoined: false, side: null, amount: 0 });
  const [now, setNow] = useState(Date.now());

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

  // Tick for countdown (active bets only)
  useEffect(() => {
    if (bet.status !== 'ACTIVE' || !bet.deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bet.status, bet.deadline]);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleJoinBet = async (side: 'A' | 'B') => {
    if (isJoining) return;

    // Use the bet's own amount - dollar bets are a dollar, fallback to $10 for legacy bets
    const betAmount = bet.betAmount || 10;

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

      // Check user balance first
      const { data: userData } = await client.models.User.get({ id: user.userId });
      const currentBalance = userData?.balance || 0;

      if (currentBalance < amount) {
        Alert.alert(
          'Insufficient Balance',
          `You need $${amount} to join this bet, but your current balance is $${currentBalance.toFixed(2)}. Please add funds to your account.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // Create participant record
      const result = await client.models.Participant.create({
        betId: bet.id,
        userId: user.userId,
        side: side,
        amount: amount,
        status: 'PENDING',
        payout: 0, // Will be calculated when bet is resolved
      });

      if (result.data) {
        // Record transaction for bet placement (this handles balance deduction automatically)
        const transaction = await TransactionService.recordBetPlacement(
          user.userId,
          amount,
          bet.id,
          result.data.id
        );

        if (!transaction) {
          // Rollback participant creation if transaction fails
          await client.models.Participant.delete({ id: result.data.id });
          throw new Error('Failed to record transaction');
        }

        // Update bet total pot
        await client.models.Bet.update({
          id: bet.id,
          totalPot: (bet.totalPot || 0) + amount,
          updatedAt: new Date().toISOString()
        });

        // Notify bet creator that someone joined their bet
        if (bet.creatorId !== user.userId) {
          try {
            const { data: creatorData } = await client.models.User.get({ id: bet.creatorId });
            const { data: joinedUserData } = await client.models.User.get({ id: user.userId });

            if (creatorData && joinedUserData) {
              await NotificationService.createNotification({
                userId: bet.creatorId,
                type: 'BET_JOINED',
                title: 'Someone Joined Your Bet!',
                message: `${joinedUserData.displayName || joinedUserData.username} joined "${bet.title}" with $${amount}`,
                priority: 'HIGH',
                actionType: 'view_bet',
                actionData: { betId: bet.id },
                relatedBetId: bet.id,
                relatedUserId: user.userId,
                sendPush: true,
              });
            }
          } catch (notificationError) {
            console.warn('Failed to send bet joined notification:', notificationError);
          }
        }

        Alert.alert(
          'Joined Successfully!',
          `You've joined the bet with $${amount} on ${side === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}. Your new balance is $${(currentBalance - amount).toFixed(2)}.`,
          [{ text: 'OK' }]
        );

        // Call optional callback
        onJoinBet?.(bet.id, side, amount);

        // Update local participation state immediately
        setUserParticipation({
          hasJoined: true,
          side: side,
          amount: amount,
        });
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


  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'LIVE':
        return colors.live;
      case 'ACTIVE':
        return colors.success;
      case 'PENDING_RESOLUTION':
        return colors.warning;
      case 'RESOLVED':
        // Blue if user won, red if lost, default green if user didn't participate
        if (userParticipation.hasJoined && bet.winningSide) {
          if (userParticipation.side === bet.winningSide) {
            return colors.info; // Blue for win
          } else {
            return colors.error; // Red for loss
          }
        }
        return colors.success; // Default green if not participated
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
  const sideACount = bet.participants?.filter(p => p.side === 'A').length || 0;
  const sideBCount = bet.participants?.filter(p => p.side === 'B').length || 0;
  const statusColor = getStatusColor(bet.status);

  let timeLeftLabel: string | null = null;
  if (bet.deadline && bet.status === 'ACTIVE') {
    const remainingMs = new Date(bet.deadline).getTime() - now;
    if (remainingMs <= 0) {
      timeLeftLabel = 'Closed';
    } else {
      const totalSecs = Math.floor(remainingMs / 1000);
      if (totalSecs < 3600) {
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        timeLeftLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      } else {
        timeLeftLabel = dateFormatting.formatDeadline(new Date(Date.now() + remainingMs));
      }
    }
  }

  const isActive = bet.status === 'ACTIVE';
  const canJoin = isActive && !userParticipation.hasJoined;
  const showInvite = isActive && onInviteFriends;

  // Get creator name if available
  const creatorName = bet.creator?.displayName || bet.creator?.username || 'Unknown';
  const isCreator = user && bet.creatorId === user.userId;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        userParticipation.hasJoined && styles.cardParticipating,
      ]}
      onPress={handlePress}
      disabled={!onPress}
      activeOpacity={0.8}
    >
      {/* Header Row: Status Badge + Pot Amount */}
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{getStatusText(bet.status)}</Text>
        </View>

        <Text style={styles.potAmount}>
          {formatCurrency(totalPot, 'USD', false)}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={1}>
        {bet.title}
      </Text>

      {/* Description */}
      {bet.description && (
        <Text style={styles.description} numberOfLines={1}>
          {bet.description}
        </Text>
      )}

      {/* Metadata Row: Time + Participants + Creator */}
      <View style={styles.metadataRow}>
        {timeLeftLabel && (
          <View style={styles.metadataItem}>
            <Text style={styles.metadataIcon}>⏱</Text>
            <Text style={styles.metadataText}>{timeLeftLabel}</Text>
          </View>
        )}
        <View style={styles.metadataItem}>
          <Text style={styles.metadataIcon}>👥</Text>
          <Text style={styles.metadataText}>{participantCount}</Text>
        </View>
        <View style={styles.metadataItem}>
          <Text style={styles.metadataIcon}>👤</Text>
          <Text style={styles.metadataText}>{isCreator ? 'You' : creatorName}</Text>
        </View>
      </View>

      {/* Sides Layout - Horizontal */}
      {showJoinOptions && isActive && (
        <View style={styles.sidesRow}>
          <TouchableOpacity
            style={[
              styles.sideBox,
              (userParticipation.hasJoined && userParticipation.side === 'A') && styles.sideBoxSelected,
              isJoining && selectedSide === 'A' && styles.sideBoxLoading
            ]}
            onPress={() => handleJoinBet('A')}
            disabled={isJoining || userParticipation.hasJoined}
            activeOpacity={canJoin ? 0.7 : 1}
          >
            {isJoining && selectedSide === 'A' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.sideName} numberOfLines={1}>
                  {bet.odds.sideAName || 'Side A'}
                </Text>
                <Text style={styles.sideCount}>{sideACount} players</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.vsDivider}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.sideBox,
              (userParticipation.hasJoined && userParticipation.side === 'B') && styles.sideBoxSelected,
              isJoining && selectedSide === 'B' && styles.sideBoxLoading
            ]}
            onPress={() => handleJoinBet('B')}
            disabled={isJoining || userParticipation.hasJoined}
            activeOpacity={canJoin ? 0.7 : 1}
          >
            {isJoining && selectedSide === 'B' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.sideName} numberOfLines={1}>
                  {bet.odds.sideBName || 'Side B'}
                </Text>
                <Text style={styles.sideCount}>{sideBCount} players</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* User Participation Indicator */}
      {userParticipation.hasJoined && (
        <View style={styles.participationIndicator}>
          <Text style={styles.participationText}>
            You bet ${userParticipation.amount} on {userParticipation.side === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}
          </Text>
        </View>
      )}

      {/* Action Buttons Row */}
      {showInvite && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={() => onInviteFriends(bet)}
            activeOpacity={0.7}
          >
            <Text style={styles.inviteButtonText}>Invite Friends</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.md,
    ...shadows.card,
  },
  cardParticipating: {
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },

  // Header Row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  statusText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  potAmount: {
    ...textStyles.pot,
    color: colors.primary,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },

  // Title & Description
  title: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  description: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },

  // Metadata Row
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  metadataIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  metadataText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },

  // Sides Row
  sidesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sideBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
    justifyContent: 'center',
  },
  sideBoxSelected: {
    backgroundColor: colors.success + '15',
    borderColor: colors.success,
    borderWidth: 2,
  },
  sideBoxLoading: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  sideName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
    textAlign: 'center',
  },
  sideCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
  },
  vsDivider: {
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

  // Participation Indicator
  participationIndicator: {
    backgroundColor: colors.success + '20',
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    alignItems: 'center',
  },
  participationText: {
    ...textStyles.caption,
    color: colors.success,
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },

  // Actions Row
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inviteButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  inviteButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: 12,
    fontWeight: typography.fontWeight.semibold,
  },
});
