/**
 * BetCard Component
 * Improved layout matching proposed design specifications
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
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import { getCurrentUser } from 'aws-amplify/auth';
import type { Schema } from '../../../amplify/data/resource';
import { colors, typography, spacing, textStyles, shadows } from '../../styles';
import { Bet, BetStatus } from '../../types/betting';
import { formatCurrency } from '../../utils/formatting';
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
  onInviteFriends?: (bet: Bet) => void;
  onEndBet?: (bet: Bet) => void;
}

// Time formatting utility
const formatTimeRemaining = (deadline: string): string => {
  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const remainingMs = deadlineTime - now;

  if (remainingMs <= 0) return 'Closed';

  const totalMinutes = Math.floor(remainingMs / (1000 * 60));
  const totalHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const totalDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));

  if (totalMinutes < 60) {
    // Less than 60 minutes: show minutes only
    return `${totalMinutes}m`;
  } else if (totalHours < 24) {
    // Less than 24 hours: show hours and minutes
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  } else {
    // 24+ hours: show days and hours
    const days = totalDays;
    const hours = totalHours % 24;
    return `${days}d ${hours}h`;
  }
};

// Format the end date for completed bets
const formatEndDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    // Today: show "Ended 2:30 PM"
    return `Ended ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    // This year: show "Ended Oct 27"
    return `Ended ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  // Other year: show "Ended Oct 27, 2024"
  return `Ended ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

export const BetCard: React.FC<BetCardProps> = ({
  bet,
  onPress,
  onJoinBet,
  onInviteFriends,
  onEndBet,
}) => {
  const { user } = useAuth();
  const [isJoining, setIsJoining] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'A' | 'B' | null>(null);
  const [userParticipation, setUserParticipation] = useState<{
    hasJoined: boolean;
    side: 'A' | 'B' | null;
    amount: number;
  }>({ hasJoined: false, side: null, amount: 0 });
  const [timeRemaining, setTimeRemaining] = useState<string>('');

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

  // Update countdown timer for ACTIVE bets
  useEffect(() => {
    if (bet.status !== 'ACTIVE' || !bet.deadline) return;

    const updateTimer = () => {
      setTimeRemaining(formatTimeRemaining(bet.deadline!));
    };

    updateTimer(); // Initial update
    const interval = setInterval(updateTimer, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [bet.status, bet.deadline]);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleJoinBet = async (side: 'A' | 'B') => {
    if (isJoining) return;

    const betAmount = bet.betAmount || 10;
    const sideName = side === 'A' ? (bet.odds.sideAName || 'Side A') : (bet.odds.sideBName || 'Side B');

    Alert.alert(
      'Join Bet',
      `Join "${bet.title}" with $${betAmount} on ${sideName}?`,
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

      // Check user balance
      const { data: userData } = await client.models.User.get({ id: user.userId });
      const currentBalance = userData?.balance || 0;

      if (currentBalance < amount) {
        Alert.alert(
          'Insufficient Balance',
          `You need $${amount} to join this bet, but your current balance is $${currentBalance.toFixed(2)}.`
        );
        return;
      }

      // Create participant record
      const result = await client.models.Participant.create({
        betId: bet.id,
        userId: user.userId,
        side: side,
        amount: amount,
        status: 'ACCEPTED',
        payout: 0,
      });

      if (result.data) {
        const participantId = result.data.id || '';
        const transaction = await TransactionService.recordBetPlacement(
          user.userId,
          amount,
          bet.id,
          participantId
        );

        if (!transaction) {
          await client.models.Participant.delete({ id: participantId });
          throw new Error('Failed to record transaction');
        }

        // Update bet total pot
        await client.models.Bet.update({
          id: bet.id,
          totalPot: (bet.totalPot || 0) + amount,
          updatedAt: new Date().toISOString()
        });

        // Notify bet creator
        if (bet.creatorId !== user.userId) {
          try {
            const { data: joinedUserData } = await client.models.User.get({ id: user.userId });
            if (joinedUserData) {
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
          `You've joined the bet with $${amount}. Your new balance is $${(currentBalance - amount).toFixed(2)}.`
        );

        onJoinBet?.(bet.id, side, amount);

        // Update local participation state
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
      Alert.alert('Error', 'Failed to join bet. Please try again.');
    } finally {
      setIsJoining(false);
      setSelectedSide(null);
    }
  };

  const handleEndBet = () => {
    if (onEndBet) {
      Alert.alert(
        'End Bet',
        'Are you sure you want to end this bet early? It will move to pending resolution.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End Bet', style: 'destructive', onPress: () => onEndBet(bet) },
        ]
      );
    }
  };

  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'ACTIVE':
        return colors.active;
      case 'PENDING_RESOLUTION':
        return colors.pending;
      case 'RESOLVED':
        // Show win/loss color if user participated
        if (userParticipation.hasJoined && bet.winningSide) {
          return userParticipation.side === bet.winningSide ? colors.success : colors.error;
        }
        return colors.resolved;
      case 'CANCELLED':
        return colors.cancelled;
      default:
        return colors.textMuted;
    }
  };

  const getStatusText = (status: BetStatus): string => {
    if (status === 'RESOLVED' && userParticipation.hasJoined && bet.winningSide) {
      return userParticipation.side === bet.winningSide ? 'WON' : 'LOST';
    }
    
    switch (status) {
      case 'ACTIVE':
        return 'ACTIVE';
      case 'PENDING_RESOLUTION':
        return 'PENDING';
      case 'RESOLVED':
        return 'RESOLVED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return status;
    }
  };

  // Calculate participant counts
  const participantCount = bet.participants?.length || 0;
  const totalPot = bet.participants?.reduce((sum, p) => sum + p.amount, 0) || bet.totalPot || 0;
  const sideACount = bet.participants?.filter(p => p.side === 'A').length || 0;
  const sideBCount = bet.participants?.filter(p => p.side === 'B').length || 0;
  const statusColor = getStatusColor(bet.status);
  const statusText = getStatusText(bet.status);

  // Determine if user is creator
  const isCreator = user && bet.creatorId === user.userId;
  const creatorName = bet.creator?.displayName || bet.creator?.username || 'Unknown';

  // Check if bet is active
  const isActive = bet.status === 'ACTIVE';
  const canJoin = isActive && !userParticipation.hasJoined;

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
      {/* Header Row: Status Badge + Title + Pot */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {bet.title}
          </Text>
        </View>
        <View style={styles.potContainer}>
          <Text style={styles.potAmount}>
            {formatCurrency(totalPot, 'USD', false)}
          </Text>
          <Text style={styles.potLabel}>POT</Text>
        </View>
      </View>

      {/* Description */}
      {bet.description && (
        <Text style={styles.description} numberOfLines={2}>
          {bet.description}
        </Text>
      )}

      {/* Metadata Row: Time + Participants + Creator */}
      <View style={styles.metadataRow}>
        {isActive && timeRemaining && (
          <View style={styles.metadataItem}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metadataText}>{timeRemaining}</Text>
          </View>
        )}
        {!isActive && bet.updatedAt && (
          <View style={styles.metadataItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={styles.metadataText}>{formatEndDate(bet.updatedAt)}</Text>
          </View>
        )}
        <View style={styles.metadataItem}>
          <Ionicons name="people-outline" size={14} color={colors.textMuted} />
          <Text style={styles.metadataText}>{participantCount} player{participantCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.metadataItem}>
          <Ionicons name="person-outline" size={14} color={colors.textMuted} />
          <Text style={styles.metadataText} numberOfLines={1}>
            {isCreator ? 'You' : creatorName}
          </Text>
        </View>
      </View>

      {/* Sides Display - Horizontal */}
      <View style={styles.sidesContainer}>
        {/* Side A */}
        <TouchableOpacity
          style={[
            styles.sideBox,
            userParticipation.hasJoined && userParticipation.side === 'A' && styles.sideBoxSelected,
            isJoining && selectedSide === 'A' && styles.sideBoxLoading,
          ]}
          onPress={() => canJoin && handleJoinBet('A')}
          disabled={!canJoin || isJoining}
          activeOpacity={canJoin ? 0.7 : 1}
        >
          {isJoining && selectedSide === 'A' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <View style={styles.sideHeader}>
                <Text style={styles.sideName} numberOfLines={1}>
                  {bet.odds.sideAName || 'Side A'}
                </Text>
                <View style={styles.sideParticipants}>
                  <Ionicons name="people" size={12} color={colors.textSecondary} />
                  <Text style={styles.sideCount}>{sideACount}</Text>
                </View>
              </View>
              {userParticipation.hasJoined && userParticipation.side === 'A' && (
                <View style={styles.userBadge}>
                  <Text style={styles.userBadgeText}>You • ${userParticipation.amount}</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>vs</Text>
        </View>

        {/* Side B */}
        <TouchableOpacity
          style={[
            styles.sideBox,
            userParticipation.hasJoined && userParticipation.side === 'B' && styles.sideBoxSelected,
            isJoining && selectedSide === 'B' && styles.sideBoxLoading,
          ]}
          onPress={() => canJoin && handleJoinBet('B')}
          disabled={!canJoin || isJoining}
          activeOpacity={canJoin ? 0.7 : 1}
        >
          {isJoining && selectedSide === 'B' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <View style={styles.sideHeader}>
                <Text style={styles.sideName} numberOfLines={1}>
                  {bet.odds.sideBName || 'Side B'}
                </Text>
                <View style={styles.sideParticipants}>
                  <Ionicons name="people" size={12} color={colors.textSecondary} />
                  <Text style={styles.sideCount}>{sideBCount}</Text>
                </View>
              </View>
              {userParticipation.hasJoined && userParticipation.side === 'B' && (
                <View style={styles.userBadge}>
                  <Text style={styles.userBadgeText}>You • ${userParticipation.amount}</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Action Buttons - Only for ACTIVE bets */}
      {isActive && (
        <View style={styles.actionRow}>
          {/* Join Button - Only for non-participants */}
          {canJoin && (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryAction]}
              onPress={() => handleJoinBet('A')} // Will show alert for side selection
              activeOpacity={0.7}
              disabled={isJoining}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.background} />
              <Text style={styles.primaryActionText}>Join ${bet.betAmount || 10}</Text>
            </TouchableOpacity>
          )}

          {/* Invite Friends - Always show for ACTIVE bets */}
          {onInviteFriends && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                canJoin ? styles.secondaryAction : styles.primaryAction,
              ]}
              onPress={() => onInviteFriends(bet)}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="person-add-outline" 
                size={18} 
                color={canJoin ? colors.primary : colors.background}
              />
              <Text style={canJoin ? styles.secondaryActionText : styles.primaryActionText}>
                Invite Friends
              </Text>
            </TouchableOpacity>
          )}

          {/* End Bet - Only for creators */}
          {isCreator && onEndBet && (
            <TouchableOpacity
              style={[styles.actionButton, styles.endBetAction]}
              onPress={handleEndBet}
              activeOpacity={0.7}
            >
              <Ionicons name="stop-circle-outline" size={18} color={colors.error} />
              <Text style={styles.endBetActionText}>End Bet</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Show payout for resolved bets where user won */}
      {bet.status === 'RESOLVED' && userParticipation.hasJoined && bet.winningSide === userParticipation.side && (
        <View style={styles.payoutContainer}>
          <Ionicons name="trophy" size={16} color={colors.success} />
          <Text style={styles.payoutText}>
            Won {formatCurrency(
              bet.participants?.find(p => p.userId === user?.userId)?.payout || 0,
              'USD',
              false
            )}
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
    marginHorizontal: spacing.sm,
    marginVertical: spacing.sm,
    padding: spacing.md,
    ...shadows.card,
  },
  cardParticipating: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },

  // Header Section
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
  },
  statusText: {
    ...textStyles.status,
    color: colors.background,
    fontSize: 10,
  },
  title: {
    ...textStyles.h4,
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  potContainer: {
    alignItems: 'flex-end',
  },
  potAmount: {
    ...textStyles.amount,
    color: colors.primary,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.fontSize.lg * 1.2,
  },
  potLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 9,
    marginTop: -2,
  },

  // Description
  description: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: typography.fontSize.sm * 1.3,
  },

  // Metadata Row
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.md,
    marginBottom: spacing.xs / 2,
  },
  metadataText: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs / 2,
    fontSize: 11,
  },

  // Sides Container
  sidesContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.sm,
  },
  sideBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: spacing.radius.md,
    padding: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 60,
    justifyContent: 'center',
  },
  sideBoxSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '10',
  },
  sideBoxLoading: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs / 2,
  },
  sideName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    flex: 1,
    marginRight: spacing.xs,
  },
  sideParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideCount: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginLeft: 2,
  },
  userBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    alignSelf: 'flex-start',
  },
  userBadgeText: {
    ...textStyles.caption,
    color: colors.primary,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  vsDivider: {
    width: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    ...textStyles.label,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: spacing.radius.md,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: colors.primary,
    minWidth: 100,
  },
  primaryActionText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
    minWidth: 100,
  },
  secondaryActionText: {
    ...textStyles.button,
    color: colors.primary,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },
  endBetAction: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
    paddingHorizontal: spacing.sm,
  },
  endBetActionText: {
    ...textStyles.button,
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },

  // Payout Display
  payoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.success + '15',
    borderRadius: spacing.radius.sm,
    marginTop: spacing.xs,
  },
  payoutText: {
    ...textStyles.button,
    color: colors.success,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.bold,
  },
});