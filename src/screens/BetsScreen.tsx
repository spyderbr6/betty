/**
 * Bets Screen
 * Main betting screen showing active bets list
 */

import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { commonStyles, colors, spacing, typography, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { SquaresGameCard } from '../components/betting/SquaresGameCard';
import { BetInviteModal } from '../components/ui/BetInviteModal';
import { Bet, BetInvitation, BetInvitationStatus, User, ParticipantStatus } from '../types/betting';
import { BetsStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';
import { NotificationService } from '../services/notificationService';
import { TransactionService } from '../services/transactionService';
import { bulkLoadUserBetsWithParticipants, clearBulkLoadingCache } from '../services/bulkLoadingService';
import { showAlert } from '../components/ui/CustomAlert';

type BetsScreenNavigationProp = StackNavigationProp<BetsStackParamList, 'BetsList'>;

// Initialize GraphQL client
const client = generateClient<Schema>();

// Helper function to transform Amplify data to our Bet type
const transformAmplifyBet = (bet: any): Bet | null => {
  // Skip bets with missing required fields
  if (!bet.id || !bet.title || !bet.description || !bet.category || !bet.status) {
    return null;
  }

  // Parse odds from JSON string if needed
  let parsedOdds = { sideAName: 'Side A', sideBName: 'Side B' }; // Default side names
  if (bet.odds) {
    try {
      if (typeof bet.odds === 'string') {
        parsedOdds = JSON.parse(bet.odds);
      } else if (typeof bet.odds === 'object') {
        parsedOdds = bet.odds;
      }
    } catch (error) {
      console.error('Error parsing bet odds:', error);
      // Use default side names on parse error
    }
  }

  return {
    id: bet.id,
    title: bet.title,
    description: bet.description,
    category: bet.category,
    status: bet.status,
    creatorId: bet.creatorId || '',
    totalPot: bet.totalPot || 0,
    betAmount: bet.betAmount || bet.totalPot || 0, // Fallback to totalPot for existing bets
    odds: parsedOdds,
    deadline: bet.deadline || new Date().toISOString(),
    winningSide: bet.winningSide || undefined,
    resolutionReason: bet.resolutionReason || undefined,
    createdAt: bet.createdAt || new Date().toISOString(),
    updatedAt: bet.updatedAt || new Date().toISOString(),
    participants: [], // Will be populated by separate query if needed
  };
};

interface SquaresGame {
  id: string;
  creatorId: string;
  eventId: string;
  title: string;
  description?: string;
  status: string;
  pricePerSquare: number;
  totalPot: number;
  squaresSold: number;
  numbersAssigned: boolean;
  createdAt: string;
}

export const BetsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<BetsScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [bets, setBets] = useState<Bet[]>([]);
  const [squaresGames, setSquaresGames] = useState<SquaresGame[]>([]);
  const [betInvitations, setBetInvitations] = useState<BetInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingInvitations, setProcessingInvitations] = useState<Set<string>>(new Set());

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedBetForInvite, setSelectedBetForInvite] = useState<Bet | null>(null);

  useEffect(() => {
    // Fetch initial bet data, squares games, bet invitations, and set up real-time subscriptions
    const fetchData = async () => {
      await Promise.all([fetchBets(), fetchSquaresGames(), fetchBetInvitations()]);
    };

    if (user?.userId) {
      fetchData();
    }
  }, [user?.userId]);

  const fetchBetInvitations = async () => {
    if (!user?.userId) return;

    try {
      // Get pending bet invitations for current user
      const { data: invitations } = await client.models.BetInvitation.list({
        filter: {
          toUserId: { eq: user.userId },
          status: { eq: 'PENDING' }
        }
      });

      if (invitations && invitations.length > 0) {
        type InvitationWithDetails = {
          id: string;
          betId: string;
          fromUserId: string;
          toUserId: string;
          status: BetInvitationStatus;
          message?: string;
          invitedSide: string;
          createdAt: string;
          updatedAt: string;
          expiresAt: string;
          bet: Bet | null;
          fromUser: User;
        };

        // Fetch bet details and from user details for each invitation
        const invitationsWithDetails: (InvitationWithDetails | null)[] = await Promise.all(
          invitations.map(async (invitation) => {
            try {
              const [betResult, fromUserResult, participantsResult] = await Promise.all([
                client.models.Bet.get({ id: invitation.betId }),
                client.models.User.get({ id: invitation.fromUserId }),
                client.models.Participant.list({
                  filter: { betId: { eq: invitation.betId } }
                })
              ]);

              if (betResult.data && fromUserResult.data) {
                const transformedBet = transformAmplifyBet(betResult.data);

                // Populate participants for the bet
                if (transformedBet && participantsResult.data) {
                  transformedBet.participants = participantsResult.data
                    .filter(p => p.userId && p.side)
                    .map(p => ({
                      id: p.id!,
                      betId: p.betId!,
                      userId: p.userId!,
                      side: p.side!,
                      amount: p.amount || 0,
                      status: p.status as ParticipantStatus || 'ACCEPTED',
                      payout: p.payout || 0,
                      joinedAt: p.joinedAt || p.createdAt || new Date().toISOString(),
                    }));
                }

                return {
                  id: invitation.id!,
                  betId: invitation.betId!,
                  fromUserId: invitation.fromUserId!,
                  toUserId: invitation.toUserId!,
                  status: invitation.status as BetInvitationStatus,
                  message: invitation.message || undefined,
                  invitedSide: invitation.invitedSide!,
                  createdAt: invitation.createdAt || new Date().toISOString(),
                  updatedAt: invitation.updatedAt || new Date().toISOString(),
                  expiresAt: invitation.expiresAt || new Date().toISOString(),
                  bet: transformedBet,
                  fromUser: {
                    id: fromUserResult.data.id!,
                    username: fromUserResult.data.username!,
                    email: fromUserResult.data.email!,
                    displayName: fromUserResult.data.displayName || undefined,
                    profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
                    balance: fromUserResult.data.balance || 0,
                    trustScore: fromUserResult.data.trustScore || 5.0,
                    totalBets: fromUserResult.data.totalBets || 0,
                    totalWinnings: fromUserResult.data.totalWinnings || 0,
                    winRate: fromUserResult.data.winRate || 0,
                    createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
                    updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
                  }
                } as InvitationWithDetails;
              }
              return null;
            } catch (error) {
              console.error(`Error fetching invitation details:`, error);
              return null;
            }
          })
        );

        const validInvitations: BetInvitation[] = invitationsWithDetails
          .filter((inv): inv is InvitationWithDetails => {
            // Filter out null invitations and invitations without bets
            if (!inv || inv.bet === null) return false;

            // Filter out invitations for bets that are no longer joinable
            const bet = inv.bet as Bet;
            if (bet.status !== 'ACTIVE') {
              // Optionally decline/expire these invitations automatically
              console.log(`Filtering out invitation for bet ${bet.id} with status ${bet.status}`);
              return false;
            }

            return true;
          })
          .map((inv) => ({
            id: inv.id,
            betId: inv.betId,
            fromUserId: inv.fromUserId,
            toUserId: inv.toUserId,
            status: inv.status,
            message: inv.message,
            invitedSide: inv.invitedSide,
            createdAt: inv.createdAt,
            updatedAt: inv.updatedAt,
            expiresAt: inv.expiresAt,
            // Optional relations preserved and non-null here
            bet: inv.bet as Bet,
            fromUser: inv.fromUser,
          }));
        setBetInvitations(validInvitations);
      } else {
        setBetInvitations([]);
      }
    } catch (error) {
      console.error('Error fetching bet invitations:', error);
    }
  };

  const fetchBets = async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);

      // Use bulk loading service for efficient data fetching
      const userBets = await bulkLoadUserBetsWithParticipants(user.userId, {
        limit: 100, // Larger limit for user's own bets
        useCache: true
      });

      setBets(userBets);
    } catch (error) {
      console.error('❌ Error bulk loading user bets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSquaresGames = async () => {
    if (!user?.userId) return;

    try {
      // Fetch squares games where user is creator or has purchases
      const [creatorGames, purchases] = await Promise.all([
        client.models.SquaresGame.list({
          filter: { creatorId: { eq: user.userId } }
        }),
        client.models.SquaresPurchase.list({
          filter: { userId: { eq: user.userId } }
        })
      ]);

      // Get unique game IDs from purchases
      const purchasedGameIds = new Set(
        (purchases.data || []).map(p => p.squaresGameId).filter(Boolean)
      );

      // Fetch games where user has purchases (excluding already loaded creator games)
      const creatorGameIds = new Set((creatorGames.data || []).map(g => g.id));
      const additionalGameIds = Array.from(purchasedGameIds).filter(
        id => !creatorGameIds.has(id)
      );

      const additionalGames = await Promise.all(
        additionalGameIds.map(id => client.models.SquaresGame.get({ id }))
      );

      // Combine all games
      const allGames = [
        ...(creatorGames.data || []),
        ...additionalGames.map(g => g.data).filter(Boolean)
      ];

      // Transform and filter for ACTIVE, LOCKED, or LIVE games only
      const transformedGames: SquaresGame[] = allGames
        .filter(game =>
          game &&
          (game.status === 'ACTIVE' || game.status === 'LOCKED' || game.status === 'LIVE')
        )
        .map(game => ({
          id: game.id!,
          creatorId: game.creatorId!,
          eventId: game.eventId!,
          title: game.title!,
          description: game.description || undefined,
          status: game.status!,
          pricePerSquare: game.pricePerSquare || 0,
          totalPot: game.totalPot || 0,
          squaresSold: game.squaresSold || 0,
          numbersAssigned: game.numbersAssigned || false,
          createdAt: game.createdAt || new Date().toISOString(),
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setSquaresGames(transformedGames);
    } catch (error) {
      console.error('❌ Error fetching squares games:', error);
    }
  };

  // Handle bet invitation acceptance
  const acceptBetInvitation = async (invitation: BetInvitation, selectedSide: string) => {
    if (!user?.userId || !invitation.bet || !selectedSide) return;

    const betAmount = invitation.bet.betAmount || 0;

    try {
      setProcessingInvitations(prev => new Set(prev).add(invitation.id));

      // Get current bet data to check if it's still joinable
      const { data: currentBet } = await client.models.Bet.get({ id: invitation.betId });

      if (!currentBet) {
        showAlert('Error', 'This bet no longer exists.');
        return;
      }

      // Check if bet is still in ACTIVE status (joinable)
      if (currentBet.status !== 'ACTIVE') {
        let statusMessage = '';
        switch (currentBet.status) {
          case 'RESOLVED':
            statusMessage = 'This bet has already been resolved.';
            break;
          case 'PENDING_RESOLUTION':
            statusMessage = 'This bet is pending resolution and can no longer be joined.';
            break;
          case 'CANCELLED':
            statusMessage = 'This bet has been cancelled.';
            break;
          case 'LIVE':
            statusMessage = 'This bet is now live and can no longer be joined.';
            break;
          default:
            statusMessage = 'This bet is no longer available to join.';
        }
        showAlert('Bet Not Available', statusMessage);
        // Remove the invalid invitation from the list
        setBetInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
        return;
      }

      // Get current user data to check balance
      const { data: currentUser } = await client.models.User.get({ id: user.userId });

      if (!currentUser) {
        showAlert('Error', 'Unable to verify your account. Please try again.');
        return;
      }

      const currentBalance = currentUser.balance || 0;

      // Check if user has sufficient balance
      if (currentBalance < betAmount) {
        showAlert(
          'Insufficient Balance',
          `You need $${betAmount.toFixed(2)} to join this bet, but you only have $${currentBalance.toFixed(2)}.`
        );
        return;
      }

      // Update invitation status
      await client.models.BetInvitation.update({
        id: invitation.id,
        status: 'ACCEPTED'
      });

      // Notify the bet creator that their invitation was accepted
      try {
        const { data: accepterData } = await client.models.User.get({ id: user.userId });
        if (accepterData && invitation.fromUserId !== user.userId) {
          await NotificationService.createNotification({
            userId: invitation.fromUserId,
            type: 'BET_INVITATION_ACCEPTED',
            title: 'Bet Invitation Accepted',
            message: `${accepterData.displayName || accepterData.username} accepted your bet invitation for "${invitation.bet?.title}"`,
            priority: 'MEDIUM',
            actionType: 'view_bet',
            actionData: { betId: invitation.betId },
            relatedBetId: invitation.betId,
            relatedUserId: user.userId,
            relatedRequestId: invitation.id,
            sendPush: true,
          });
        }
      } catch (notificationError) {
        console.warn('Failed to send bet invitation accepted notification:', notificationError);
      }

      // Create participant entry for the bet
      const participantResult = await client.models.Participant.create({
        betId: invitation.betId,
        userId: user.userId,
        side: selectedSide,
        amount: betAmount,
        status: 'ACCEPTED',
        payout: 0,
        joinedAt: new Date().toISOString(),
      });

      if (!participantResult.data) {
        throw new Error('Failed to create participant record');
      }

      // Record transaction for bet placement (this handles balance deduction automatically)
      const participantId = participantResult.data.id || '';
      const betOdds = currentBet.odds ? JSON.parse(currentBet.odds) : { sideAName: 'Side A', sideBName: 'Side B' };
      const joinedSideName = selectedSide === 'A' ? (betOdds.sideAName || 'Side A') : (betOdds.sideBName || 'Side B');
      const transaction = await TransactionService.recordBetPlacement(
        user.userId,
        betAmount,
        invitation.betId,
        participantId,
        currentBet.title || 'Bet',
        joinedSideName
      );

      if (!transaction) {
        // Rollback participant creation if transaction fails
        await client.models.Participant.delete({ id: participantId });
        throw new Error('Failed to record transaction');
      }

      // Update bet's total pot
      const currentTotalPot = invitation.bet.totalPot || 0;
      await client.models.Bet.update({
        id: invitation.betId,
        totalPot: currentTotalPot + betAmount,
      });

      // Send notification to the inviter
      const { data: accepterData } = await client.models.User.get({ id: user.userId });
      const currentUserDisplayName = accepterData?.displayName || accepterData?.username || user.username;
      await NotificationService.createNotification({
        userId: invitation.fromUserId,
        type: 'BET_INVITATION_ACCEPTED',
        title: 'Invitation Accepted!',
        message: `${currentUserDisplayName} accepted your bet invitation for "${invitation.bet.title}"`,
        priority: 'MEDIUM',
        actionType: 'view_bet',
        actionData: { betId: invitation.betId },
        relatedBetId: invitation.betId,
        relatedUserId: user.userId,
      });

      // Remove from local invitations
      setBetInvitations(prev => prev.filter(inv => inv.id !== invitation.id));

      // Refresh bets to show updated participant list and clear cache for fresh data
      clearBulkLoadingCache();
      await fetchBets();

      // Show toast notification (joinedSideName already calculated above)
      setToastMessage(`Joined "${invitation.bet.title}" on ${joinedSideName}! $${betAmount.toFixed(2)} deducted.`);
      setShowToast(true);

      // Hide toast after 3 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      console.error('Error accepting bet invitation:', error);
      showAlert('Error', 'Failed to accept invitation. Please try again.');
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  // Handle bet invitation decline
  const declineBetInvitation = async (invitation: BetInvitation) => {
    try {
      setProcessingInvitations(prev => new Set(prev).add(invitation.id));

      // Update invitation status
      await client.models.BetInvitation.update({
        id: invitation.id,
        status: 'DECLINED'
      });

      // Notify the bet creator that their invitation was declined
      try {
        if (user?.userId) {
          const { data: declinerData } = await client.models.User.get({ id: user.userId });
          if (declinerData && invitation.fromUserId !== user.userId) {
            await NotificationService.createNotification({
              userId: invitation.fromUserId,
              type: 'BET_INVITATION_DECLINED',
              title: 'Bet Invitation Declined',
              message: `${declinerData.displayName || declinerData.username} declined your bet invitation for "${invitation.bet?.title}"`,
              priority: 'LOW',
              actionType: 'view_bet',
              actionData: { betId: invitation.betId },
              relatedBetId: invitation.betId,
              relatedUserId: user.userId,
              relatedRequestId: invitation.id,
              sendPush: false, // Low priority, no push needed
            });
          }
        }
      } catch (notificationError) {
        console.warn('Failed to send bet invitation declined notification:', notificationError);
      }

      // Remove from local invitations
      setBetInvitations(prev => prev.filter(inv => inv.id !== invitation.id));

      showAlert('Declined', 'Bet invitation declined.');
    } catch (error) {
      console.error('Error declining bet invitation:', error);
      showAlert('Error', 'Failed to decline invitation. Please try again.');
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  // Handle refresh
  const onRefresh = async () => {
    try {
      setRefreshing(true);

      // Clear cache for fresh data on manual refresh
      clearBulkLoadingCache();

      await Promise.all([fetchBets(), fetchSquaresGames(), fetchBetInvitations()]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSquaresGamePress = (gameId: string) => {
    console.log('[BetsScreen] Navigating to squares game:', gameId);
    navigation.navigate('SquaresGameDetail', { gameId });
  };

  // Set up real-time subscriptions using pushed data directly (no refetching)
  useEffect(() => {
    if (!user?.userId) return;

    console.log('📡 Setting up real-time subscriptions for user:', user.userId);

    // 1. Bet subscription - use pushed data directly
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        or: [
          { status: { eq: 'ACTIVE' } },
          { status: { eq: 'PENDING_RESOLUTION' } }
        ]
      }
    }).subscribe({
      next: async ({ items }) => {
        console.log('📡 Bet subscription update received:', items.length, 'bets');

        // Fetch participants for all bets in parallel
        const betsWithParticipants = await Promise.all(
          items.map(async (bet) => {
            try {
              const { data: participants } = await client.models.Participant.list({
                filter: { betId: { eq: bet.id } }
              });

              const transformedBet = transformAmplifyBet(bet);
              if (transformedBet && participants) {
                transformedBet.participants = participants
                  .filter(p => p.userId && p.side)
                  .map(p => ({
                    id: p.id!,
                    betId: p.betId!,
                    userId: p.userId!,
                    side: p.side!,
                    amount: p.amount || 0,
                    status: p.status as ParticipantStatus || 'ACCEPTED',
                    payout: p.payout || 0,
                    joinedAt: p.joinedAt || p.createdAt || new Date().toISOString(),
                  }));
              }
              return transformedBet;
            } catch (error) {
              console.error('Error fetching participants for bet:', bet.id, error);
              return transformAmplifyBet(bet);
            }
          })
        );

        // Filter for user's bets (creator or participant)
        const userBets = betsWithParticipants.filter((bet): bet is Bet => {
          if (!bet) return false;
          const isCreator = bet.creatorId === user.userId;
          const isParticipant = bet.participants?.some(p => p.userId === user.userId);
          return isCreator || isParticipant;
        });

        // Sort by createdAt descending (newest first)
        userBets.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setBets(userBets);
      },
      error: (error) => {
        console.error('❌ Real-time bet subscription error:', error);
      }
    });

    // 2. SquaresGame subscription - listen for games user is involved in
    const squaresSubscription = client.models.SquaresGame.observeQuery({
      filter: {
        or: [
          { status: { eq: 'ACTIVE' } },
          { status: { eq: 'LOCKED' } },
          { status: { eq: 'LIVE' } }
        ]
      }
    }).subscribe({
      next: async ({ items }) => {
        console.log('📡 SquaresGame subscription update received:', items.length, 'games');

        // Get user's purchases to identify games they're in
        const { data: userPurchases } = await client.models.SquaresPurchase.list({
          filter: { userId: { eq: user.userId } }
        });

        const purchasedGameIds = new Set(
          (userPurchases || []).map(p => p.squaresGameId).filter(Boolean)
        );

        // Filter for games where user is creator or has purchases
        const userGames = items.filter(game =>
          game.creatorId === user.userId || purchasedGameIds.has(game.id)
        );

        // Transform and sort
        const transformedGames: SquaresGame[] = userGames
          .map(game => ({
            id: game.id!,
            creatorId: game.creatorId!,
            eventId: game.eventId!,
            title: game.title!,
            description: game.description || undefined,
            status: game.status!,
            pricePerSquare: game.pricePerSquare || 0,
            totalPot: game.totalPot || 0,
            squaresSold: game.squaresSold || 0,
            numbersAssigned: game.numbersAssigned || false,
            createdAt: game.createdAt || new Date().toISOString(),
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setSquaresGames(transformedGames);
      },
      error: (error) => {
        console.error('❌ Real-time squares subscription error:', error);
      }
    });

    // 3. BetInvitation subscription - listen for pending invitations
    const invitationSubscription = client.models.BetInvitation.observeQuery({
      filter: {
        and: [
          { toUserId: { eq: user.userId } },
          { status: { eq: 'PENDING' } }
        ]
      }
    }).subscribe({
      next: async ({ items }) => {
        console.log('📡 BetInvitation subscription update received:', items.length, 'invitations');

        // Fetch bet and user details for each invitation
        const invitationsWithDetails = await Promise.all(
          items.map(async (invitation) => {
            try {
              const [betResult, fromUserResult, participantsResult] = await Promise.all([
                client.models.Bet.get({ id: invitation.betId }),
                client.models.User.get({ id: invitation.fromUserId }),
                client.models.Participant.list({
                  filter: { betId: { eq: invitation.betId } }
                })
              ]);

              if (betResult.data && fromUserResult.data) {
                const transformedBet = transformAmplifyBet(betResult.data);

                // Populate participants
                if (transformedBet && participantsResult.data) {
                  transformedBet.participants = participantsResult.data
                    .filter(p => p.userId && p.side)
                    .map(p => ({
                      id: p.id!,
                      betId: p.betId!,
                      userId: p.userId!,
                      side: p.side!,
                      amount: p.amount || 0,
                      status: p.status as ParticipantStatus || 'ACCEPTED',
                      payout: p.payout || 0,
                      joinedAt: p.joinedAt || p.createdAt || new Date().toISOString(),
                    }));
                }

                // Only include if bet is still ACTIVE
                if (transformedBet && transformedBet.status === 'ACTIVE') {
                  return {
                    id: invitation.id!,
                    betId: invitation.betId!,
                    fromUserId: invitation.fromUserId!,
                    toUserId: invitation.toUserId!,
                    status: invitation.status as BetInvitationStatus,
                    message: invitation.message || undefined,
                    invitedSide: invitation.invitedSide!,
                    createdAt: invitation.createdAt || new Date().toISOString(),
                    updatedAt: invitation.updatedAt || new Date().toISOString(),
                    expiresAt: invitation.expiresAt || new Date().toISOString(),
                    bet: transformedBet,
                    fromUser: {
                      id: fromUserResult.data.id!,
                      username: fromUserResult.data.username!,
                      email: fromUserResult.data.email!,
                      displayName: fromUserResult.data.displayName || undefined,
                      profilePictureUrl: fromUserResult.data.profilePictureUrl || undefined,
                      balance: fromUserResult.data.balance || 0,
                      trustScore: fromUserResult.data.trustScore || 5.0,
                      totalBets: fromUserResult.data.totalBets || 0,
                      totalWinnings: fromUserResult.data.totalWinnings || 0,
                      winRate: fromUserResult.data.winRate || 0,
                      createdAt: fromUserResult.data.createdAt || new Date().toISOString(),
                      updatedAt: fromUserResult.data.updatedAt || new Date().toISOString(),
                    }
                  };
                }
              }
              return null;
            } catch (error) {
              console.error('Error fetching invitation details:', error);
              return null;
            }
          })
        );

        const validInvitations = invitationsWithDetails.filter(
          (inv): inv is BetInvitation => inv !== null
        );

        setBetInvitations(validInvitations);
      },
      error: (error) => {
        console.error('❌ Real-time invitation subscription error:', error);
      }
    });

    // Cleanup subscriptions on unmount
    return () => {
      console.log('📡 Cleaning up real-time subscriptions');
      betSubscription.unsubscribe();
      squaresSubscription.unsubscribe();
      invitationSubscription.unsubscribe();
    };
  }, [user?.userId]);

  const handleJoinBet = (betId: string, side: string, amount: number) => {
    console.log(`User joined bet ${betId} on side ${side} with $${amount}`);
    // Bet will be automatically updated via subscription
  };

  const handleBetPress = (bet: Bet) => {
    console.log('Bet pressed:', bet.title);
    // Navigate to bet details
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
    // Navigate to balance/wallet screen
  };

  const handleEndBet = async (bet: Bet) => {
    try {
      // Update bet status to PENDING_RESOLUTION
      await client.models.Bet.update({
        id: bet.id,
        status: 'PENDING_RESOLUTION',
        updatedAt: new Date().toISOString(),
      });

      // Clear cache and refresh bets
      clearBulkLoadingCache();
      await fetchBets();

      showAlert('Bet Ended', 'Your bet has been moved to pending resolution. You can now declare the winner.');
    } catch (error) {
      console.error('Error ending bet:', error);
      showAlert('Error', 'Failed to end bet. Please try again.');
    }
  };

  // Removed - Header handles notifications internally now


  // Real user stats state
  const [userStats, setUserStats] = useState({
    winRate: 0,
    totalBets: 0,
    totalWinnings: 0,
    trustScore: 0,
    balance: 0,
  });

  // Fetch real user stats
  useEffect(() => {
    const fetchUserStats = async () => {
      if (user?.userId) {
        try {
          const { data: userData } = await client.models.User.get({ id: user.userId });
          if (userData) {
            setUserStats({
              winRate: userData.winRate || 0,
              totalBets: userData.totalBets || 0,
              totalWinnings: userData.totalWinnings || 0,
              trustScore: userData.trustScore || 0,
              balance: userData.balance || 0,
            });
          }
        } catch (error) {
          console.error('Error fetching user stats:', error);
        }
      }
    };

    fetchUserStats();
  }, [user]);


  // Filter for user's ACTIVE bets only (created by user OR user is participant)
  const filteredBets = bets.filter(bet => {
    const isCreator = bet.creatorId === user?.userId;
    const isParticipant = bet.participants?.some(p => p.userId === user?.userId);

    // First filter by user involvement
    if (!(isCreator || isParticipant)) return false;

    // Only show ACTIVE bets (PENDING_RESOLUTION moved to Results tab)
    if (bet.status !== 'ACTIVE') return false;

    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
      />

      {/* Toast Banner */}
      {showToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.background} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: spacing.navigation.baseHeight + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Bet Invitations Section */}
        {betInvitations.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PENDING INVITATIONS</Text>
              <View style={styles.invitationBadge}>
                <Text style={styles.invitationBadgeText}>{betInvitations.length}</Text>
              </View>
            </View>

            {betInvitations.map((invitation) => (
              <BetInvitationCard
                key={invitation.id}
                invitation={invitation}
                onAccept={(side) => acceptBetInvitation(invitation, side)}
                onDecline={() => declineBetInvitation(invitation)}
                isProcessing={processingInvitations.has(invitation.id)}
              />
            ))}
          </>
        )}

        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* Squares Games Section */}
            {squaresGames.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>BETTING SQUARES</Text>
                </View>

                {squaresGames.map((game) => (
                  <SquaresGameCard
                    key={game.id}
                    squaresGame={game}
                    onPress={() => handleSquaresGamePress(game.id)}
                  />
                ))}
              </>
            )}

            {/* Bets Section */}
            {filteredBets.length > 0 ? (
              <>
                {squaresGames.length > 0 && (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>ACTIVE BETS</Text>
                  </View>
                )}
                {filteredBets.map((bet) => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onPress={handleBetPress}
                    onJoinBet={handleJoinBet}
                    onInviteFriends={(bet) => {
                      setSelectedBetForInvite(bet);
                      setShowInviteModal(true);
                    }}
                    onEndBet={handleEndBet}
                  />
                ))}
              </>
            ) : null}

            {/* Empty State - only show if no bets AND no squares */}
            {filteredBets.length === 0 && squaresGames.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No Active Games</Text>
                <Text style={styles.emptyDescription}>
                  You don't have any active bets or squares games at the moment. Create or join one to get started!
                </Text>
              </View>
            )}
          </>
        )}

        {/* Bottom Stats */}
        <View style={styles.bottomStatsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{filteredBets.length + squaresGames.length}</Text>
              <Text style={styles.statLabel}>ACTIVE</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.winRate.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>WIN RATE</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.totalBets}</Text>
              <Text style={styles.statLabel}>TOTAL BETS</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.trustScore.toFixed(1)}</Text>
              <Text style={styles.statLabel}>TRUST SCORE</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bet Invite Modal */}
      {selectedBetForInvite && (
        <BetInviteModal
          visible={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            setSelectedBetForInvite(null);
          }}
          bet={selectedBetForInvite}
          onInvitesSent={(count) => {
            setToastMessage(`Successfully invited ${count} friend${count > 1 ? 's' : ''}!`);
            setShowToast(true);
            setTimeout(() => {
              setShowToast(false);
            }, 3000);
          }}
        />
      )}
    </SafeAreaView>
  );
};

// Bet Invitation Card Component
interface BetInvitationCardProps {
  invitation: BetInvitation;
  onAccept: (side: string) => void;
  onDecline: () => void;
  isProcessing: boolean;
}

const BetInvitationCard: React.FC<BetInvitationCardProps> = ({
  invitation,
  onAccept,
  onDecline,
  isProcessing,
}) => {
  const [selectedSide, setSelectedSide] = React.useState<string | null>(null);

  if (!invitation.bet) return null;

  const parseBetOdds = (odds: any) => {
    try {
      const parsedOdds = typeof odds === 'string' ? JSON.parse(odds) : odds;
      return {
        sideAName: parsedOdds?.sideAName || 'Side A',
        sideBName: parsedOdds?.sideBName || 'Side B',
      };
    } catch {
      return {
        sideAName: 'Side A',
        sideBName: 'Side B',
      };
    }
  };

  const betOdds = parseBetOdds(invitation.bet.odds);
  const hasSpecificSide = invitation.invitedSide && invitation.invitedSide.trim() !== '';
  const invitedSideName = hasSpecificSide
    ? (invitation.invitedSide === 'A' ? betOdds.sideAName : betOdds.sideBName)
    : null;
  const timeUntilExpiry = new Date(invitation.expiresAt).getTime() - new Date().getTime();
  const hoursLeft = Math.max(0, Math.floor(timeUntilExpiry / (1000 * 60 * 60)));

  // Calculate participant counts for each side
  const sideACount = invitation.bet.participants?.filter(p => p.side === 'A').length || 0;
  const sideBCount = invitation.bet.participants?.filter(p => p.side === 'B').length || 0;

  return (
    <View style={[styles.betCard, styles.invitationCard]}>
      {/* Invitation Header */}
      <View style={styles.invitationHeader}>
        <View style={styles.invitationFromUser}>
          <View style={styles.userAvatarSmall}>
            <Text style={styles.userAvatarTextSmall}>
              {(invitation.fromUser?.displayName || invitation.fromUser?.email?.split('@')[0] || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.invitationFromText}>
            {invitation.fromUser?.displayName || invitation.fromUser?.email?.split('@')[0]} invited you
          </Text>
        </View>
        <View style={styles.expiryContainer}>
          <Ionicons name="time-outline" size={12} color={colors.warning} />
          <Text style={styles.expiryText}>{hoursLeft}h left</Text>
        </View>
      </View>

      {/* Bet Details */}
      <View style={styles.invitationBetDetails}>
        <View style={styles.invitationTitleRow}>
          <Text style={styles.invitationBetTitle}>{invitation.bet.title}</Text>
          <Text style={styles.invitationAmount}>${invitation.bet.betAmount || 0}</Text>
        </View>
        <Text style={styles.invitationBetDescription} numberOfLines={2}>
          {invitation.bet.description}
        </Text>

        {hasSpecificSide && (
          <View style={styles.invitationSideInfo}>
            <Text style={styles.invitationSideLabel}>Your side:</Text>
            <Text style={styles.invitationSideName}>{invitedSideName}</Text>
          </View>
        )}

        {/* Side Selection - only show if no specific side is invited */}
        {!hasSpecificSide && (
          <View style={styles.sideSelectionContainer}>
            <Text style={styles.sideSelectionLabel}>Choose your side:</Text>
            <View style={styles.sideOptions}>
              <TouchableOpacity
                style={[
                  styles.sideOption,
                  selectedSide === 'A' && styles.sideOptionSelected
                ]}
                onPress={() => setSelectedSide('A')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.sideOptionIndicator,
                  selectedSide === 'A' && styles.sideOptionIndicatorSelected
                ]} />
                <View style={styles.sideOptionContent}>
                  <Text style={[
                    styles.sideOptionText,
                    selectedSide === 'A' && styles.sideOptionTextSelected
                  ]}>
                    {betOdds.sideAName}
                  </Text>
                  <View style={styles.sideOptionParticipants}>
                    <Ionicons name="people-outline" size={11} color={selectedSide === 'A' ? colors.background : colors.textMuted} />
                    <Text style={[
                      styles.sideOptionParticipantCount,
                      selectedSide === 'A' && styles.sideOptionParticipantCountSelected
                    ]}>
                      {sideACount}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sideOption,
                  styles.sideOptionLast,
                  selectedSide === 'B' && styles.sideOptionSelected
                ]}
                onPress={() => setSelectedSide('B')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.sideOptionIndicator,
                  selectedSide === 'B' && styles.sideOptionIndicatorSelected
                ]} />
                <View style={styles.sideOptionContent}>
                  <Text style={[
                    styles.sideOptionText,
                    selectedSide === 'B' && styles.sideOptionTextSelected
                  ]}>
                    {betOdds.sideBName}
                  </Text>
                  <View style={styles.sideOptionParticipants}>
                    <Ionicons name="people-outline" size={11} color={selectedSide === 'B' ? colors.background : colors.textMuted} />
                    <Text style={[
                      styles.sideOptionParticipantCount,
                      selectedSide === 'B' && styles.sideOptionParticipantCountSelected
                    ]}>
                      {sideBCount}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.invitationActions}>
        <TouchableOpacity
          style={[styles.invitationButton, styles.declineButton]}
          onPress={onDecline}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Ionicons name="close" size={16} color={colors.error} />
              <Text style={[styles.invitationButtonText, styles.declineButtonText]}>
                Decline
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.invitationButton,
            styles.acceptButton,
            (!hasSpecificSide && !selectedSide) && styles.acceptButtonDisabled
          ]}
          onPress={() => onAccept(hasSpecificSide ? invitation.invitedSide : selectedSide!)}
          disabled={isProcessing || (!hasSpecificSide && !selectedSide)}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Ionicons
                name="checkmark"
                size={16}
                color={(!hasSpecificSide && !selectedSide) ? colors.textMuted : colors.background}
              />
              <Text style={[
                styles.invitationButtonText,
                styles.acceptButtonText,
                (!hasSpecificSide && !selectedSide) && styles.acceptButtonTextDisabled
              ]}>
                Accept & Join
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },


  // Section Header (for invitations)
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.lg,
  },

  // Loading and Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Bottom Stats
  bottomStatsContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.xl,
    textAlign: 'center',
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
    textTransform: 'uppercase',
  },

  // Invitation Badge
  invitationBadge: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitationBadgeText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },

  // Bet Card Base
  betCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Invitation Card Styles
  invitationCard: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '08',
  },
  invitationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  invitationFromUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  userAvatarTextSmall: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  invitationFromText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  expiryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryText: {
    ...textStyles.caption,
    color: colors.warning,
    fontSize: 11,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.medium,
  },

  // Invitation Bet Details
  invitationBetDetails: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  invitationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs / 2,
  },
  invitationBetTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  invitationBetDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  invitationBetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  invitationSideInfo: {
    flex: 1,
  },
  invitationSideLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  invitationSideName: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  invitationAmountInfo: {
    alignItems: 'flex-end',
  },
  invitationAmountLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  invitationAmount: {
    ...textStyles.pot,
    color: colors.warning,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  invitationMessage: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xs,
    padding: spacing.xs,
    marginTop: spacing.xs,
  },
  invitationMessageText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontSize: 12,
    lineHeight: 16,
  },

  // Invitation Actions
  invitationActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  invitationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  declineButton: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: spacing.radius.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.radius.md,
  },
  invitationButtonText: {
    ...textStyles.button,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  declineButtonText: {
    color: colors.error,
  },
  acceptButtonText: {
    color: colors.background,
  },
  acceptButtonDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  acceptButtonTextDisabled: {
    color: colors.textMuted,
  },

  // Side Selection Styles
  sideSelectionContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sideSelectionLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  sideOptions: {
    flexDirection: 'row',
  },
  sideOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.sm,
  },
  sideOptionLast: {
    marginRight: 0,
  },
  sideOptionSelected: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  sideOptionIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.xs,
    backgroundColor: colors.background,
  },
  sideOptionIndicatorSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sideOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideOptionText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  sideOptionTextSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  sideOptionParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  sideOptionParticipantCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: 3,
  },
  sideOptionParticipantCountSelected: {
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },

  // Toast Banner
  toastBanner: {
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: spacing.radius.sm,
  },
  toastText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
});
