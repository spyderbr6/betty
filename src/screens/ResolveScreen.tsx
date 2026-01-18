/**
 * Resolve Screen
 * Screen for resolving pending bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { SquaresGameCard } from '../components/betting/SquaresGameCard';
import { Bet } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { NotificationService } from '../services/notificationService';
import { TransactionService } from '../services/transactionService';
import { showAlert } from '../components/ui/CustomAlert';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BetsStackParamList } from '../types/navigation';

type ResolveScreenNavigationProp = StackNavigationProp<BetsStackParamList, 'BetsList'>;

// Initialize GraphQL client
const client = generateClient<Schema>();

// Helper function to transform Amplify data to our Bet type
const transformAmplifyBet = (bet: any): Bet | null => {
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
    betAmount: bet.betAmount || bet.totalPot || 0,
    odds: parsedOdds,
    deadline: bet.deadline || new Date().toISOString(),
    winningSide: bet.winningSide || undefined,
    resolutionReason: bet.resolutionReason || undefined,
    disputeWindowEndsAt: bet.disputeWindowEndsAt || undefined,
    createdAt: bet.createdAt || new Date().toISOString(),
    updatedAt: bet.updatedAt || new Date().toISOString(),
    participants: [],
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

export const ResolveScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<ResolveScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [pendingBets, setPendingBets] = useState<Bet[]>([]);
  const [resolvedSquares, setResolvedSquares] = useState<SquaresGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSides, setSelectedSides] = useState<Record<string, 'A' | 'B' | null>>({});

  useEffect(() => {
    if (!user) return;

    const fetchPendingBets = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching bets pending resolution and resolved squares for user:', user.userId);

        // Fetch all PENDING_RESOLUTION bets (for everyone, not just creators)
        const { data: betsData } = await client.models.Bet.list({
          filter: {
            status: { eq: 'PENDING_RESOLUTION' }
          },
        });

        if (betsData) {
          const betsWithParticipants = await Promise.all(
            betsData.map(async (bet) => {
              const { data: participants } = await client.models.Participant.list({
                filter: { betId: { eq: bet.id! } }
              });

              const transformedBet = transformAmplifyBet(bet);
              if (transformedBet && participants) {
                transformedBet.participants = participants
                  .filter(p => p.id && p.betId && p.userId && p.side)
                  .map(p => ({
                    id: p.id!,
                    betId: p.betId!,
                    userId: p.userId!,
                    side: p.side!,
                    amount: p.amount || 0,
                    status: p.status as 'PENDING' | 'ACCEPTED' | 'DECLINED',
                    payout: p.payout || 0,
                    joinedAt: p.joinedAt || new Date().toISOString(),
                  }));
              }
              return transformedBet;
            })
          );

          const validBets = betsWithParticipants.filter((bet): bet is Bet => bet !== null);

          // Filter to only show bets where user is involved (creator or participant)
          const userBets = validBets.filter(bet => {
            const isCreator = bet.creatorId === user.userId;
            const isParticipant = bet.participants?.some(p => p.userId === user.userId);

            // Show all PENDING_RESOLUTION bets where user is involved
            return isCreator || isParticipant;
          });

          // Priority sorting: creator's bets needing resolution FIRST (no winningSide), then all others by creation date
          const sortedBets = userBets.sort((a, b) => {
            const aIsCreator = a.creatorId === user.userId;
            const bIsCreator = b.creatorId === user.userId;
            const aNeedsResolution = aIsCreator && !a.winningSide;
            const bNeedsResolution = bIsCreator && !b.winningSide;

            // Priority 1: Bets needing resolution (creator's bets without winningSide) go first
            if (aNeedsResolution && !bNeedsResolution) return -1;
            if (!aNeedsResolution && bNeedsResolution) return 1;

            // Priority 2: Sort by creation date (newest first)
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          console.log('Found pending resolution bets:', sortedBets.length);
          setPendingBets(sortedBets);
        }

        // Fetch RESOLVED and PENDING_RESOLUTION squares games where user has purchases
        const { data: userPurchases } = await client.models.SquaresPurchase.list({
          filter: { userId: { eq: user.userId } }
        });

        if (userPurchases && userPurchases.length > 0) {
          const squaresGameIds = [...new Set(userPurchases.map(p => p.squaresGameId).filter(Boolean))];

          // Fetch all the games
          const gamesPromises = squaresGameIds.map(id =>
            client.models.SquaresGame.get({ id: id! })
          );
          const gamesResults = await Promise.all(gamesPromises);

          // Filter to RESOLVED or PENDING_RESOLUTION games and transform
          const resolvedGames: SquaresGame[] = gamesResults
            .map(result => result.data)
            .filter(game => game && (game.status === 'RESOLVED' || game.status === 'PENDING_RESOLUTION'))
            .map(game => ({
              id: game!.id!,
              creatorId: game!.creatorId!,
              eventId: game!.eventId!,
              title: game!.title!,
              description: game!.description || undefined,
              status: game!.status!,
              pricePerSquare: game!.pricePerSquare || 0,
              totalPot: game!.totalPot || 0,
              squaresSold: game!.squaresSold || 0,
              numbersAssigned: game!.numbersAssigned || false,
              createdAt: game!.createdAt || new Date().toISOString(),
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          console.log('Found resolved/pending squares games:', resolvedGames.length);
          setResolvedSquares(resolvedGames);
        }
      } catch (error) {
        console.error('Error fetching pending bets and resolved squares:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPendingBets();

    // Set up real-time subscription for bet resolution changes
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        or: [
          { status: { eq: 'PENDING_RESOLUTION' } },
          { status: { eq: 'RESOLVED' } }
        ]
      }
    }).subscribe({
      next: async (data) => {
        console.log('Real-time bet resolution update:', data);
        await fetchPendingBets();
      },
      error: (error) => {
        console.error('Real-time bet resolution subscription error:', error);
      }
    });

    // Set up real-time subscription for squares game resolution changes
    const squaresSubscription = client.models.SquaresGame.observeQuery({
      filter: {
        or: [
          { status: { eq: 'PENDING_RESOLUTION' } },
          { status: { eq: 'RESOLVED' } }
        ]
      }
    }).subscribe({
      next: async (data) => {
        console.log('Real-time squares game resolution update:', data);
        await fetchPendingBets(); // This also fetches squares games
      },
      error: (error) => {
        console.error('Real-time squares game subscription error:', error);
      }
    });

    return () => {
      betSubscription.unsubscribe();
      squaresSubscription.unsubscribe();
    };
  }, [user]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      if (!user) return;

      // Re-run the pending bets query
      const { data: betsData } = await client.models.Bet.list({
        filter: {
          or: [
            { status: { eq: 'PENDING_RESOLUTION' } },
            {
              and: [
                { status: { eq: 'ACTIVE' } },
                { creatorId: { eq: user.userId } },
                { deadline: { lt: new Date().toISOString() } }
              ]
            }
          ]
        },
      });

      if (betsData) {
        const betsWithParticipants = await Promise.all(
          betsData.map(async (bet) => {
            const { data: participants } = await client.models.Participant.list({
              filter: { betId: { eq: bet.id! } }
            });

            const transformedBet = transformAmplifyBet(bet);
            if (transformedBet && participants) {
              transformedBet.participants = participants
                .filter(p => p.id && p.betId && p.userId && p.side)
                .map(p => ({
                  id: p.id!,
                  betId: p.betId!,
                  userId: p.userId!,
                  side: p.side!,
                  amount: p.amount || 0,
                  status: p.status as 'PENDING' | 'ACCEPTED' | 'DECLINED',
                  payout: p.payout || 0,
                  joinedAt: p.joinedAt || new Date().toISOString(),
                }));
            }
            return transformedBet;
          })
        );

        const validBets = betsWithParticipants.filter((bet): bet is Bet => bet !== null);
        const resolvableBets = validBets.filter(bet => {
          const isCreator = bet.creatorId === user.userId;
          const isParticipant = bet.participants?.some(p => p.userId === user.userId);
          const hasParticipants = bet.participants && bet.participants.length > 0;
          return hasParticipants && (isCreator || isParticipant);
        });

        // Sort by creation date (newest first)
        const sortedBets = resolvableBets.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setPendingBets(sortedBets);
      }

      // Refresh RESOLVED and PENDING_RESOLUTION squares games where user has purchases
      const { data: userPurchases } = await client.models.SquaresPurchase.list({
        filter: { userId: { eq: user.userId } }
      });

      if (userPurchases && userPurchases.length > 0) {
        const squaresGameIds = [...new Set(userPurchases.map(p => p.squaresGameId).filter(Boolean))];

        const gamesPromises = squaresGameIds.map(id =>
          client.models.SquaresGame.get({ id: id! })
        );
        const gamesResults = await Promise.all(gamesPromises);

        const resolvedGames: SquaresGame[] = gamesResults
          .map(result => result.data)
          .filter(game => game && (game.status === 'RESOLVED' || game.status === 'PENDING_RESOLUTION'))
          .map(game => ({
            id: game!.id!,
            creatorId: game!.creatorId!,
            eventId: game!.eventId!,
            title: game!.title!,
            description: game!.description || undefined,
            status: game!.status!,
            pricePerSquare: game!.pricePerSquare || 0,
            totalPot: game!.totalPot || 0,
            squaresSold: game!.squaresSold || 0,
            numbersAssigned: game!.numbersAssigned || false,
            createdAt: game!.createdAt || new Date().toISOString(),
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setResolvedSquares(resolvedGames);
      } else {
        setResolvedSquares([]);
      }
    } catch (error) {
      console.error('Error refreshing pending bets and resolved squares:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSideSelection = (bet: Bet, side: 'A' | 'B') => {
    if (isResolving) return;

    // Only allow creator to resolve bets
    if (bet.creatorId !== user?.userId) {
      showAlert('Error', 'Only the bet creator can resolve this bet.');
      return;
    }

    setSelectedSides(prev => ({
      ...prev,
      [bet.id]: prev[bet.id] === side ? null : side // Toggle selection
    }));
  };

  const handleConfirmResolution = async (bet: Bet) => {
    const selectedSide = selectedSides[bet.id];
    if (!selectedSide) return;

    await confirmResolveBet(bet, selectedSide);
  };

  const confirmResolveBet = async (bet: Bet, winningSide: 'A' | 'B') => {
    setIsResolving(bet.id);

    try {
      // Calculate payouts for each participant
      const winners = bet.participants?.filter(p => p.side === winningSide) || [];
      const totalWinnerAmount = winners.reduce((sum, p) => sum + p.amount, 0);
      const totalPot = bet.totalPot;

      // Calculate dispute window end time (48 hours from now)
      const disputeWindowEndsAt = new Date();
      disputeWindowEndsAt.setHours(disputeWindowEndsAt.getHours() + 48);

      // Update bet status to PENDING_RESOLUTION (48-hour dispute window)
      await client.models.Bet.update({
        id: bet.id,
        status: 'PENDING_RESOLUTION',
        winningSide: winningSide,
        resolutionReason: `Resolved by creator. Winner: ${winningSide === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}`,
        disputeWindowEndsAt: disputeWindowEndsAt.toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Create pending payout transactions (balance NOT updated yet - happens after 48h dispute window)
      if (bet.participants) {
        await Promise.all(
          bet.participants.map(async (participant) => {
            const isWinner = participant.side === winningSide;
            let payout = 0;

            if (isWinner && totalWinnerAmount > 0) {
              // Winner gets their original amount back plus their share of the total pot
              const winnerShare = participant.amount / totalWinnerAmount;
              payout = totalPot * winnerShare;
            }

            // Calculate platform fee (3% of winnings) for winners
            const platformFee = isWinner && payout > 0 ? Math.round(payout * 0.03 * 100) / 100 : 0;
            const netPayout = payout - platformFee;

            // Update participant record with calculated payout (gross amount)
            await client.models.Participant.update({
              id: participant.id,
              payout: payout,
              status: isWinner ? 'ACCEPTED' : 'DECLINED'
            });

            // Create PENDING transactions (will be completed by payout-processor after 48h)
            if (isWinner && payout > 0) {
              // Get current balance for transaction record
              const { data: userData } = await client.models.User.get({ id: participant.userId });
              const currentBalance = userData?.balance || 0;

              // Calculate platform fee (3% of winnings) - will be applied when payout-processor completes transaction
              const platformFee = Math.round(payout * 0.03 * 100) / 100;
              const netPayout = payout - platformFee;

              await client.models.Transaction.create({
                userId: participant.userId,
                type: 'BET_WON',
                status: 'PENDING', // NOT COMPLETED - awaiting dispute window
                amount: payout, // Gross payout amount (before fees) - consistent with deposits
                actualAmount: netPayout, // Net amount received after platform fee
                platformFee: platformFee, // 3% platform fee
                balanceBefore: currentBalance,
                balanceAfter: currentBalance + netPayout, // Projected balance (after fee)
                relatedBetId: bet.id,
                relatedParticipantId: participant.id,
                notes: `Bet winnings (pending 48h dispute window): ${bet.title}`,
                createdAt: new Date().toISOString()
              });
            } else if (!isWinner) {
              // Record lost bet transaction (zero amount, for tracking/dispute)
              await TransactionService.recordBetLoss(
                participant.userId,
                bet.id,
                participant.id
              );
            }

            // Send bet resolved notification to participant
            if (participant.userId !== user?.userId) {
              try {
                // Calculate net payout for winner notification
                const netPayoutForNotification = isWinner ? payout - Math.round(payout * 0.03 * 100) / 100 : 0;

                await NotificationService.createNotification({
                  userId: participant.userId,
                  type: 'BET_RESOLVED',
                  title: isWinner ? 'Bet Won! (Pending)' : 'Bet Lost',
                  message: isWinner
                    ? `You won $${netPayoutForNotification.toFixed(2)} on "${bet.title}". Funds will be available in 48 hours if no disputes are filed.`
                    : `You lost on "${bet.title}". The winner was ${winningSide === 'A' ? bet.odds.sideAName : bet.odds.sideBName}.`,
                  priority: isWinner ? 'HIGH' : 'MEDIUM',
                  actionType: 'view_bet',
                  actionData: { betId: bet.id },
                  relatedBetId: bet.id,
                  relatedUserId: undefined
                });
              } catch (notificationError) {
                console.warn('Failed to send bet resolved notification to participant:', notificationError);
              }
            }
          })
        );
      }


      // Clear the selection for this bet
      setSelectedSides(prev => ({
        ...prev,
        [bet.id]: null
      }));

      // Show success message
      showAlert(
        'Bet Resolved',
        `Winner: ${winningSide === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'}\n\nPayouts are pending a 48-hour dispute window. If no disputes are filed, funds will be automatically distributed.`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('Error resolving bet:', error);
      showAlert(
        'Error',
        'Failed to resolve bet. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsResolving(null);
    }
  };

  const updateUserStats = async (userId: string, isWinner: boolean, betAmount: number, payout: number) => {
    try {
      // Get current user data
      const { data: userData } = await client.models.User.get({ id: userId });

      if (userData) {
        const currentBalance = userData.balance || 0;
        const currentTotalBets = userData.totalBets || 0;
        const currentTotalWinnings = userData.totalWinnings || 0;
        const currentWinRate = userData.winRate || 0;

        // Calculate new stats
        const newTotalBets = currentTotalBets + 1;
        let newBalance = currentBalance;
        let newTotalWinnings = currentTotalWinnings;
        let newWinRate = currentWinRate;

        if (isWinner) {
          // Winner balance is already updated by TransactionService.recordBetWinnings
          // Just update stats here
          newBalance = currentBalance; // Balance already updated by transaction
          newTotalWinnings = currentTotalWinnings + (payout - betAmount); // Profit only

          // Calculate new win rate (winners count / total bets)
          const previousWins = Math.round((currentWinRate / 100) * currentTotalBets);
          const newWins = previousWins + 1;
          newWinRate = (newWins / newTotalBets) * 100;
        } else {
          // Loser loses their bet amount (already deducted when they joined)
          // Balance doesn't change as they already paid when joining
          newTotalWinnings = currentTotalWinnings - betAmount; // Record the loss

          // Calculate new win rate (no new wins)
          const previousWins = Math.round((currentWinRate / 100) * currentTotalBets);
          newWinRate = (previousWins / newTotalBets) * 100;
        }

        // Update user record
        await client.models.User.update({
          id: userId,
          balance: newBalance,
          totalBets: newTotalBets,
          totalWinnings: newTotalWinnings,
          winRate: newWinRate,
          updatedAt: new Date().toISOString()
        });

        console.log(`Updated user ${userId} stats: ${isWinner ? 'WIN' : 'LOSS'}, Balance: $${newBalance}, WinRate: ${newWinRate.toFixed(1)}%`);
      }
    } catch (error) {
      console.error(`Error updating user ${userId} stats:`, error);
      // Don't throw error here to avoid breaking bet resolution
    }
  };

  const handleBetPress = (bet: Bet) => {
    console.log('Pending bet pressed:', bet.title);
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  // Removed - Header handles notifications internally now


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
      />

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
        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading pending bets...</Text>
          </View>
        ) : pendingBets.length > 0 || resolvedSquares.length > 0 ? (
          <>
            {/* Pending Resolution Bets */}
            {pendingBets.map((bet) => (
            <View key={bet.id} style={styles.betContainer}>
              <BetCard
                bet={bet}
                onPress={handleBetPress}
              />

              {/* Resolution Actions - Only show if user is creator AND bet needs resolution */}
              {bet.creatorId === user?.userId && (bet.status === 'ACTIVE' || (bet.status === 'PENDING_RESOLUTION' && !bet.winningSide)) && (
                <View style={styles.resolutionActions}>
                  {/* Payout Preview */}
                  <View style={styles.payoutPreview}>
                    <Text style={styles.payoutTitle}>Total Pot: {formatCurrency(bet.totalPot)}</Text>
                    <Text style={styles.payoutSubtitle}>Winners split the entire pot based on their contribution</Text>
                  </View>

                  <Text style={styles.resolutionTitle}>Select the winning side:</Text>
                  <View style={styles.resolutionButtons}>
                    <TouchableOpacity
                      style={[
                        styles.resolutionButton,
                        styles.resolutionButtonA,
                        selectedSides[bet.id] === 'A' && styles.resolutionButtonSelected,
                        isResolving === bet.id && styles.resolutionButtonDisabled
                      ]}
                      onPress={() => handleSideSelection(bet, 'A')}
                      disabled={isResolving === bet.id}
                    >
                      <>
                        <Text style={[
                          styles.resolutionButtonText,
                          selectedSides[bet.id] === 'A' && styles.resolutionButtonTextSelected
                        ]}>
                          {bet.odds.sideAName || 'Side A'}
                        </Text>
                        <Text style={[
                          styles.resolutionButtonPayout,
                          selectedSides[bet.id] === 'A' && styles.resolutionButtonPayoutSelected
                        ]}>
                          {bet.participants?.filter(p => p.side === 'A').length || 0} winners
                        </Text>
                      </>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.resolutionButton,
                        styles.resolutionButtonB,
                        selectedSides[bet.id] === 'B' && styles.resolutionButtonSelected,
                        isResolving === bet.id && styles.resolutionButtonDisabled
                      ]}
                      onPress={() => handleSideSelection(bet, 'B')}
                      disabled={isResolving === bet.id}
                    >
                      <>
                        <Text style={[
                          styles.resolutionButtonText,
                          selectedSides[bet.id] === 'B' && styles.resolutionButtonTextSelected
                        ]}>
                          {bet.odds.sideBName || 'Side B'}
                        </Text>
                        <Text style={[
                          styles.resolutionButtonPayout,
                          selectedSides[bet.id] === 'B' && styles.resolutionButtonPayoutSelected
                        ]}>
                          {bet.participants?.filter(p => p.side === 'B').length || 0} winners
                        </Text>
                      </>
                    </TouchableOpacity>
                  </View>

                  {/* Confirm Resolution Button */}
                  {selectedSides[bet.id] && (
                    <TouchableOpacity
                      style={[
                        styles.confirmButton,
                        isResolving === bet.id && styles.confirmButtonDisabled
                      ]}
                      onPress={() => handleConfirmResolution(bet)}
                      disabled={isResolving === bet.id}
                    >
                      {isResolving === bet.id ? (
                        <ActivityIndicator size="small" color={colors.background} />
                      ) : (
                        <>
                          <Text style={styles.confirmButtonText}>
                            Resolve: {selectedSides[bet.id] === 'A' ? bet.odds.sideAName || 'Side A' : bet.odds.sideBName || 'Side B'} Wins
                          </Text>
                          <Text style={styles.confirmButtonSubtext}>
                            This action cannot be undone
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
            ))}

            {/* Resolved & Pending Resolution Squares Games */}
            {resolvedSquares.length > 0 && (
              <View style={styles.squaresSection}>
                {pendingBets.length > 0 && (
                  <Text style={styles.sectionTitle}>SQUARES GAMES</Text>
                )}
                {resolvedSquares.map((game) => (
                  <SquaresGameCard
                    key={game.id}
                    squaresGame={game}
                    onPress={() => navigation.navigate('SquaresGameDetail', { gameId: game.id })}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Pending Resolutions</Text>
            <Text style={styles.emptyDescription}>
              All your bets are either still active or already resolved. Great job staying on top of things!
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
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

  // Bet Container
  betContainer: {
    marginBottom: spacing.lg,
  },

  // Resolution Actions
  resolutionActions: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: spacing.radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  resolutionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  resolutionButtons: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  resolutionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resolutionButtonA: {
    marginRight: spacing.xs,
  },
  resolutionButtonB: {
    marginLeft: spacing.xs,
  },
  resolutionButtonDisabled: {
    opacity: 0.6,
  },
  resolutionButtonText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  resolutionButtonPayout: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
  resolutionButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  resolutionButtonTextSelected: {
    color: colors.background,
  },
  resolutionButtonPayoutSelected: {
    color: colors.background,
    opacity: 0.9,
  },

  // Confirm Button
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    minHeight: 50,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.xs / 2,
  },
  confirmButtonSubtext: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    opacity: 0.8,
    textAlign: 'center',
  },

  // Payout Preview
  payoutPreview: {
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  payoutTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  payoutSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },

  // Squares Section
  squaresSection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...textStyles.h4,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0.5,
  },
});
