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
import { BetAcceptanceService } from '../../services/betAcceptanceService';
import { clearBulkLoadingCache } from '../../services/bulkLoadingService';
import { FileDisputeModal } from '../ui/FileDisputeModal';
import { showAlert } from '../ui/CustomAlert';

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
  // Track if user joined locally (to prevent stale prop from resetting state)
  const [locallyJoined, setLocallyJoined] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptanceProgress, setAcceptanceProgress] = useState<{
    totalCount: number;
    acceptedCount: number;
    hasUserAccepted: boolean;
  }>({ totalCount: 0, acceptedCount: 0, hasUserAccepted: false });

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
        // Sync locallyJoined with server data
        setLocallyJoined(true);
      } else if (!locallyJoined) {
        // Only reset if we haven't locally confirmed a join
        // This prevents stale props from overwriting successful local joins
        setUserParticipation({ hasJoined: false, side: null, amount: 0 });
      }
    }
  }, [user, bet.participants, locallyJoined]);

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

  // Load acceptance progress for PENDING_RESOLUTION bets
  useEffect(() => {
    const loadAcceptanceProgress = async () => {
      if (bet.status !== 'PENDING_RESOLUTION' || !bet.winningSide || !user) return;

      try {
        const progress = await BetAcceptanceService.getAcceptanceProgress(bet.id);
        const hasUserAccepted = progress.acceptedUserIds.includes(user.userId);

        setAcceptanceProgress({
          totalCount: progress.totalCount,
          acceptedCount: progress.acceptedCount,
          hasUserAccepted
        });
      } catch (error) {
        console.error('Error loading acceptance progress:', error);
      }
    };

    loadAcceptanceProgress();
  }, [bet.status, bet.winningSide, bet.id, user, bet.participants]);

  const handlePress = () => {
    onPress?.(bet);
  };

  const handleAcceptResult = async () => {
    if (!user || isAccepting) return;

    setIsAccepting(true);

    try {
      const success = await BetAcceptanceService.acceptBetResult(bet.id, user.userId);

      if (success) {
        // Update local state to show acceptance
        setAcceptanceProgress(prev => ({
          ...prev,
          acceptedCount: prev.acceptedCount + 1,
          hasUserAccepted: true
        }));

        // Show success message
        showAlert(
          'Result Accepted',
          'You have accepted this bet result. If all participants accept, payout will be processed within 5 minutes.',
          [{ text: 'OK' }]
        );
      } else {
        showAlert(
          'Error',
          'Failed to accept bet result. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error accepting bet result:', error);
      showAlert(
        'Error',
        'An error occurred. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsAccepting(false);
    }
  };

  const handleJoinBet = async (side: 'A' | 'B') => {
    // Prevent join if already joining or already joined
    if (isJoining || userParticipation.hasJoined) return;

    const betAmount = bet.betAmount || 10;
    const sideName = side === 'A' ? (bet.odds.sideAName || 'Side A') : (bet.odds.sideBName || 'Side B');

    showAlert(
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

      // Check if user already joined this bet (server-side validation)
      const { data: existingParticipants } = await client.models.Participant.list({
        filter: {
          betId: { eq: bet.id },
          userId: { eq: user.userId }
        }
      });

      if (existingParticipants && existingParticipants.length > 0) {
        // User already joined - update local state to reflect this
        const existingParticipant = existingParticipants[0];
        setLocallyJoined(true);
        setUserParticipation({
          hasJoined: true,
          side: existingParticipant.side as 'A' | 'B',
          amount: existingParticipant.amount,
        });
        showAlert(
          'Already Joined',
          'You have already joined this bet.'
        );
        return;
      }

      // Check user balance
      const { data: userData } = await client.models.User.get({ id: user.userId });
      const currentBalance = userData?.balance || 0;

      if (currentBalance < amount) {
        showAlert(
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
        const sideName = side === 'A' ? (bet.odds.sideAName || 'Side A') : (bet.odds.sideBName || 'Side B');
        const transaction = await TransactionService.recordBetPlacement(
          user.userId,
          amount,
          bet.id,
          participantId,
          bet.title,
          sideName
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

        showAlert(
          'Joined Successfully!',
          `You've joined the bet with $${amount}. Your new balance is $${(currentBalance - amount).toFixed(2)}.`
        );

        // Clear the bulk loading cache to ensure fresh data on next fetch
        // This fixes the issue where cached bet data shows stale participant counts
        clearBulkLoadingCache();

        onJoinBet?.(bet.id, side, amount);

        // Update local participation state and mark as locally joined
        // This prevents stale props from resetting the UI
        setLocallyJoined(true);
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
      showAlert('Error', 'Failed to join bet. Please try again.');
    } finally {
      setIsJoining(false);
      setSelectedSide(null);
    }
  };

  const handleEndBet = () => {
    if (onEndBet) {
      showAlert(
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
        // Show win/loss color if user participated
        if (userParticipation.hasJoined && bet.winningSide) {
          return userParticipation.side === bet.winningSide ? colors.success : colors.error;
        }
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
    // Show WON/LOST for both PENDING_RESOLUTION and RESOLVED if user participated
    if ((status === 'RESOLVED' || status === 'PENDING_RESOLUTION') && userParticipation.hasJoined && bet.winningSide) {
      const isWinner = userParticipation.side === bet.winningSide;
      if (status === 'PENDING_RESOLUTION') {
        // Both winners and losers show (PENDING) during dispute window
        return isWinner ? 'WON (PENDING)' : 'LOST (PENDING)';
      }
      return isWinner ? 'WON' : 'LOST';
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
        <View
          style={[
            styles.sideBox,
            userParticipation.hasJoined && userParticipation.side === 'A' && styles.sideBoxSelected,
            isJoining && selectedSide === 'A' && styles.sideBoxLoading,
          ]}
        >
          {isJoining && selectedSide === 'A' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Text style={styles.sideName} numberOfLines={1}>
                {bet.odds.sideAName || 'Side A'}
              </Text>
              <View style={styles.sideInfo}>
                {userParticipation.hasJoined && userParticipation.side === 'A' ? (
                  <View style={styles.sideParticipantsJoined}>
                    <Text style={styles.sideInfoText}>You • ${userParticipation.amount} • </Text>
                    <Ionicons name="people" size={12} color={colors.primary} />
                    <Text style={styles.sideInfoText}>{sideACount}</Text>
                  </View>
                ) : (
                  <View style={styles.sideParticipants}>
                    <Ionicons name="people" size={12} color={colors.textSecondary} />
                    <Text style={styles.sideCount}>{sideACount}</Text>
                  </View>
                )}
              </View>
              {/* Join button for Side A */}
              {canJoin && (
                <TouchableOpacity
                  style={styles.sideJoinButton}
                  onPress={() => handleJoinBet('A')}
                  activeOpacity={0.7}
                  disabled={isJoining}
                >
                  <Text style={styles.sideJoinButtonText}>Join ${bet.betAmount || 10}</Text>
                </TouchableOpacity>
              )}
              {/* Joined indicator */}
              {userParticipation.hasJoined && userParticipation.side === 'A' && (
                <View style={styles.joinedIndicator}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.joinedIndicatorText}>JOINED</Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* VS Divider */}
        <View style={styles.vsDivider}>
          <Text style={styles.vsText}>vs</Text>
        </View>

        {/* Side B */}
        <View
          style={[
            styles.sideBox,
            userParticipation.hasJoined && userParticipation.side === 'B' && styles.sideBoxSelected,
            isJoining && selectedSide === 'B' && styles.sideBoxLoading,
          ]}
        >
          {isJoining && selectedSide === 'B' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Text style={styles.sideName} numberOfLines={1}>
                {bet.odds.sideBName || 'Side B'}
              </Text>
              <View style={styles.sideInfo}>
                {userParticipation.hasJoined && userParticipation.side === 'B' ? (
                  <View style={styles.sideParticipantsJoined}>
                    <Text style={styles.sideInfoText}>You • ${userParticipation.amount} • </Text>
                    <Ionicons name="people" size={12} color={colors.primary} />
                    <Text style={styles.sideInfoText}>{sideBCount}</Text>
                  </View>
                ) : (
                  <View style={styles.sideParticipants}>
                    <Ionicons name="people" size={12} color={colors.textSecondary} />
                    <Text style={styles.sideCount}>{sideBCount}</Text>
                  </View>
                )}
              </View>
              {/* Join button for Side B */}
              {canJoin && (
                <TouchableOpacity
                  style={styles.sideJoinButton}
                  onPress={() => handleJoinBet('B')}
                  activeOpacity={0.7}
                  disabled={isJoining}
                >
                  <Text style={styles.sideJoinButtonText}>Join ${bet.betAmount || 10}</Text>
                </TouchableOpacity>
              )}
              {/* Joined indicator */}
              {userParticipation.hasJoined && userParticipation.side === 'B' && (
                <View style={styles.joinedIndicator}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.joinedIndicatorText}>JOINED</Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>

      {/* PENDING_RESOLUTION: Two states based on winningSide */}
      {bet.status === 'PENDING_RESOLUTION' && (
        <>
          {/* State 1: Awaiting creator's decision (no winningSide yet) */}
          {!bet.winningSide && (
            <View style={styles.awaitingResolutionContainer}>
              <View style={styles.awaitingResolutionHeader}>
                <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
                <Text style={styles.awaitingResolutionTitle}>Awaiting Resolution</Text>
              </View>
              <Text style={styles.awaitingResolutionMessage}>
                The bet creator has up to 24 hours to declare the winner. You'll be notified once resolved.
              </Text>
            </View>
          )}

          {/* State 2: Winner declared, dispute window active (winningSide is set) */}
          {bet.winningSide && bet.disputeWindowEndsAt && (
            <View style={styles.disputeWindowContainer}>
              {/* Win/Loss Result - Prominent for participants */}
              {userParticipation.hasJoined && (
                <View style={[
                  styles.resultBanner,
                  userParticipation.side === bet.winningSide ? styles.resultBannerWin : styles.resultBannerLose
                ]}>
                  <Ionicons
                    name={userParticipation.side === bet.winningSide ? "trophy" : "close-circle"}
                    size={20}
                    color={userParticipation.side === bet.winningSide ? colors.success : colors.error}
                  />
                  <Text style={[
                    styles.resultText,
                    userParticipation.side === bet.winningSide ? styles.resultTextWin : styles.resultTextLose
                  ]}>
                    {userParticipation.side === bet.winningSide
                      ? `You Won - ${bet.winningSide === 'A' ? bet.odds.sideAName : bet.odds.sideBName}`
                      : `You Lost - ${bet.winningSide === 'A' ? bet.odds.sideAName : bet.odds.sideBName} Won`
                    }
                  </Text>
                </View>
              )}

              {/* Dispute Window Countdown */}
              <View style={styles.disputeWindowHeader}>
                <Ionicons name="time-outline" size={16} color={colors.warning} />
                <Text style={styles.disputeWindowText}>
                  {userParticipation.hasJoined && userParticipation.side === bet.winningSide
                    ? `Payout in ${formatTimeRemaining(bet.disputeWindowEndsAt)}`
                    : `Dispute window ends in ${formatTimeRemaining(bet.disputeWindowEndsAt)}`
                  }
                </Text>
              </View>

              {/* Resolution Reason */}
              {bet.resolutionReason && (
                <Text style={styles.resolutionReason} numberOfLines={2}>
                  {bet.resolutionReason}
                </Text>
              )}

              {/* Acceptance Progress Bar - Show if at least one participant has accepted */}
              {acceptanceProgress.totalCount > 0 && acceptanceProgress.acceptedCount > 0 && (
                <View style={styles.acceptanceProgressContainer}>
                  <View style={styles.acceptanceProgressHeader}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.acceptanceProgressText}>
                      {acceptanceProgress.acceptedCount} of {acceptanceProgress.totalCount} accepted
                    </Text>
                  </View>
                  <View style={styles.acceptanceProgressBar}>
                    <View
                      style={[
                        styles.acceptanceProgressFill,
                        { width: `${(acceptanceProgress.acceptedCount / acceptanceProgress.totalCount) * 100}%` }
                      ]}
                    />
                  </View>
                  <Text style={styles.acceptanceProgressSubtext}>
                    {acceptanceProgress.acceptedCount === acceptanceProgress.totalCount
                      ? 'All participants accepted! Payout processing soon...'
                      : 'Accept early to close this bet and receive payout faster'}
                  </Text>
                </View>
              )}

              {/* Accept Result Button - Only for NON-CREATOR participants who haven't accepted yet */}
              {userParticipation.hasJoined && !acceptanceProgress.hasUserAccepted && bet.creatorId !== user?.userId && (
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={handleAcceptResult}
                  activeOpacity={0.7}
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={colors.background} />
                      <Text style={styles.acceptButtonText}>Accept Result</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* File Dispute Button - Available for all participants including creator */}
              {userParticipation.hasJoined && (
                <TouchableOpacity
                  style={styles.disputeButton}
                  onPress={() => setShowDisputeModal(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                  <Text style={styles.disputeButtonText}>File Dispute</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      {/* Action Buttons - Only for ACTIVE bets */}
      {isActive && (onInviteFriends || (isCreator && onEndBet)) && (
        <View style={styles.actionRow}>
          {/* Invite Friends - Always show for ACTIVE bets */}
          {onInviteFriends && (
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryAction]}
              onPress={() => onInviteFriends(bet)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.background} />
              <Text style={styles.primaryActionText}>Invite Friends</Text>
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

      {/* File Dispute Modal */}
      <FileDisputeModal
        visible={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        bet={bet}
        userId={user?.userId || ''}
        onDisputeFiled={() => {
          // Refresh bet data or show success message
          setShowDisputeModal(false);
        }}
      />
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
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
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
  sideName: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.xs / 2,
  },
  sideInfo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideInfoText: {
    ...textStyles.caption,
    color: colors.primary,
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },
  sideParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideParticipantsJoined: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideCount: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginLeft: 2,
  },
  sideJoinButton: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  sideJoinButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  joinedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  joinedIndicatorText: {
    ...textStyles.caption,
    color: colors.primary,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    marginLeft: 2,
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

  // Awaiting Resolution (PENDING_RESOLUTION without winningSide)
  awaitingResolutionContainer: {
    backgroundColor: colors.textMuted + '10',
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.textMuted + '30',
  },
  awaitingResolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  awaitingResolutionTitle: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  awaitingResolutionMessage: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
  },

  // Dispute Window (PENDING_RESOLUTION with winningSide)
  disputeWindowContainer: {
    backgroundColor: colors.warning + '10',
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning + '30',
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginBottom: spacing.sm,
  },
  resultBannerWin: {
    backgroundColor: colors.success + '15',
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  resultBannerLose: {
    backgroundColor: colors.error + '10',
    borderWidth: 1,
    borderColor: colors.error + '30',
  },
  resultText: {
    ...textStyles.button,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.bold,
    flex: 1,
  },
  resultTextWin: {
    color: colors.success,
  },
  resultTextLose: {
    color: colors.error,
  },
  disputeWindowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  disputeWindowText: {
    ...textStyles.button,
    color: colors.warning,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  resolutionReason: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  // Acceptance Progress
  acceptanceProgressContainer: {
    backgroundColor: colors.success + '10',
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.success + '30',
  },
  acceptanceProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  acceptanceProgressText: {
    ...textStyles.button,
    color: colors.success,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  acceptanceProgressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: spacing.radius.xs,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  acceptanceProgressFill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: spacing.radius.xs,
  },
  acceptanceProgressSubtext: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    lineHeight: 14,
  },

  // Accept Result Button
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  acceptButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },

  disputeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: spacing.radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disputeButtonText: {
    ...textStyles.button,
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
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