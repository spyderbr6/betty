/**
 * Bets Screen
 * Main betting screen showing active bets list
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { commonStyles, colors, spacing, typography, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { Bet, BetInvitation, BetInvitationStatus, User } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';
import { NotificationService } from '../services/notificationService';
import { bulkLoadUserBetsWithParticipants, clearBulkLoadingCache } from '../services/bulkLoadingService';

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

export const BetsScreen: React.FC = () => {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [betInvitations, setBetInvitations] = useState<BetInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'ACTIVE' | 'PENDING_RESOLUTION' | 'RESOLVED'>('ACTIVE');
  const [refreshing, setRefreshing] = useState(false);
  const [processingInvitations, setProcessingInvitations] = useState<Set<string>>(new Set());

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    // Fetch initial bet data, bet invitations, and set up real-time subscriptions
    const fetchData = async () => {
      await Promise.all([fetchBets(), fetchBetInvitations()]);
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
              const [betResult, fromUserResult] = await Promise.all([
                client.models.Bet.get({ id: invitation.betId }),
                client.models.User.get({ id: invitation.fromUserId })
              ]);

              if (betResult.data && fromUserResult.data) {
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
                  bet: transformAmplifyBet(betResult.data),
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

  // Handle bet invitation acceptance
  const acceptBetInvitation = async (invitation: BetInvitation, selectedSide: string) => {
    if (!user?.userId || !invitation.bet || !selectedSide) return;

    const betAmount = invitation.bet.betAmount || 0;

    try {
      setProcessingInvitations(prev => new Set(prev).add(invitation.id));

      // Get current bet data to check if it's still joinable
      const { data: currentBet } = await client.models.Bet.get({ id: invitation.betId });

      if (!currentBet) {
        Alert.alert('Error', 'This bet no longer exists.');
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
        Alert.alert('Bet Not Available', statusMessage);
        // Remove the invalid invitation from the list
        setBetInvitations(prev => prev.filter(inv => inv.id !== invitation.id));
        return;
      }

      // Get current user data to check balance
      const { data: currentUser } = await client.models.User.get({ id: user.userId });

      if (!currentUser) {
        Alert.alert('Error', 'Unable to verify your account. Please try again.');
        return;
      }

      const currentBalance = currentUser.balance || 0;

      // Check if user has sufficient balance
      if (currentBalance < betAmount) {
        Alert.alert(
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
      await client.models.Participant.create({
        betId: invitation.betId,
        userId: user.userId,
        side: selectedSide,
        amount: betAmount,
        status: 'ACCEPTED',
        payout: 0,
        joinedAt: new Date().toISOString(),
      });

      // Deduct bet amount from user's balance
      await client.models.User.update({
        id: user.userId,
        balance: currentBalance - betAmount,
      });

      // Update bet's total pot
      const currentTotalPot = invitation.bet.totalPot || 0;
      await client.models.Bet.update({
        id: invitation.betId,
        totalPot: currentTotalPot + betAmount,
      });

      // Send notification to the inviter
      const currentUserDisplayName = user.username;
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

      // Get side name for success message
      const parseBetOdds = (odds: any) => {
        try {
          const parsedOdds = typeof odds === 'string' ? JSON.parse(odds) : odds;
          return {
            sideAName: parsedOdds?.sideAName || 'Side A',
            sideBName: parsedOdds?.sideBName || 'Side B',
          };
        } catch {
          return { sideAName: 'Side A', sideBName: 'Side B' };
        }
      };

      const betOdds = parseBetOdds(invitation.bet.odds);
      const joinedSideName = selectedSide === 'A' ? betOdds.sideAName : betOdds.sideBName;

      // Show toast notification
      setToastMessage(`Joined "${invitation.bet.title}" on ${joinedSideName}! $${betAmount.toFixed(2)} deducted.`);
      setShowToast(true);

      // Hide toast after 3 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      console.error('Error accepting bet invitation:', error);
      Alert.alert('Error', 'Failed to accept invitation. Please try again.');
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
      } catch (notificationError) {
        console.warn('Failed to send bet invitation declined notification:', notificationError);
      }

      // Remove from local invitations
      setBetInvitations(prev => prev.filter(inv => inv.id !== invitation.id));

      Alert.alert('Declined', 'Bet invitation declined.');
    } catch (error) {
      console.error('Error declining bet invitation:', error);
      Alert.alert('Error', 'Failed to decline invitation. Please try again.');
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

      await Promise.all([fetchBets(), fetchBetInvitations()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Set up real-time subscriptions (moved inside useEffect)
  useEffect(() => {
    if (!user?.userId) return;

    // Set up real-time subscription for bet changes
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        or: [
          { status: { eq: 'ACTIVE' } },
          { status: { eq: 'LIVE' } },
          { status: { eq: 'PENDING_RESOLUTION' } },
          { status: { eq: 'RESOLVED' } }
        ]
      }
    }).subscribe({
      next: async (_data) => {
        // Clear cache and refetch to get latest data
        clearBulkLoadingCache();
        await fetchBets();
      },
      error: (error) => {
        console.error('❌ Real-time bet subscription error:', error);
      }
    });

    // Set up real-time subscription for participant changes
    const participantSubscription = client.models.Participant.observeQuery().subscribe({
      next: async (_participantData) => {
        // Clear cache and refetch to get latest data
        clearBulkLoadingCache();
        await fetchBets();
      },
      error: (error) => {
        console.error('❌ Real-time participant subscription error:', error);
      }
    });

    // Cleanup subscriptions on unmount
    return () => {
      betSubscription.unsubscribe();
      participantSubscription.unsubscribe();
    };
  }, []);

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

  const handleNotificationsPress = () => {
    console.log('Notifications pressed');
    // Navigate to notifications screen
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchToggle = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery(''); // Clear search when hiding
    }
  };

  // const handleFilterPress = () => {
  //   console.log('Filter pressed');
  //   // Show filter modal
  // };


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

  // Mock live game data
  const liveGame = {
    homeTeam: 'LAL',
    awayTeam: 'GSW',
    homeScore: 89,
    awayScore: 92,
    quarter: 'Q3',
    timeLeft: '8:42',
    venue: 'Crypto.com Arena',
    liveBetsCount: 12,
  };

  // Filter for user's specific bets (created by user OR user is participant)
  const filteredBets = bets.filter(bet => {
    const isCreator = bet.creatorId === user?.userId;
    const isParticipant = bet.participants?.some(p => p.userId === user?.userId);

    // First filter by user involvement
    if (!(isCreator || isParticipant)) return false;

    // Then filter by status
    if (bet.status !== selectedFilter) return false;

    // Finally filter by search query if one exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const titleMatch = bet.title.toLowerCase().includes(query);
      const descriptionMatch = bet.description.toLowerCase().includes(query);
      const sideAMatch = bet.odds.sideAName.toLowerCase().includes(query);
      const sideBMatch = bet.odds.sideBName.toLowerCase().includes(query);
      return titleMatch || descriptionMatch || sideAMatch || sideBMatch;
    }

    return true;
  });


  // Status filter options (removed 'ALL' filter, commented out LIVE filter)
  const statusFilters = [
    { id: 'ACTIVE', label: 'Active', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && bet.status === 'ACTIVE';
    }).length },
    // { id: 'LIVE', label: 'Live', count: bets.filter(bet => {
    //   const isCreator = bet.creatorId === user?.userId;
    //   const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
    //   return (isCreator || isParticipant) && bet.status === 'LIVE';
    // }).length },
    { id: 'PENDING_RESOLUTION', label: 'Pending', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && bet.status === 'PENDING_RESOLUTION';
    }).length },
    { id: 'RESOLVED', label: 'Resolved', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && bet.status === 'RESOLVED';
    }).length },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
        onNotificationsPress={handleNotificationsPress}
        notificationCount={2}
        liveGame={liveGame}
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

        {/* My Bets Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MY BETS</Text>
          <TouchableOpacity
            style={styles.searchIconButton}
            onPress={handleSearchToggle}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showSearch ? "close" : "search"}
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Search Input (conditionally shown) */}
        {showSearch && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons
                name="search"
                size={16}
                color={colors.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search your bets..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Status Filters */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScrollView}>
            {statusFilters.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.filterButton,
                  selectedFilter === filter.id && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(filter.id as any)}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === filter.id && styles.filterButtonTextActive
                ]}>
                  {filter.label}
                </Text>
                {filter.count > 0 && (
                  <View style={[
                    styles.filterBadge,
                    selectedFilter === filter.id && styles.filterBadgeActive
                  ]}>
                    <Text style={[
                      styles.filterBadgeText,
                      selectedFilter === filter.id && styles.filterBadgeTextActive
                    ]}>
                      {filter.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading bets...</Text>
          </View>
        ) : filteredBets.length > 0 ? (
          filteredBets.map((bet) => (
            <BetCard
              key={bet.id}
              bet={bet}
              onPress={handleBetPress}
              onJoinBet={handleJoinBet}
              showJoinOptions={bet.status === 'ACTIVE'}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            {selectedFilter === 'PENDING_RESOLUTION' ? (
              <>
                <Text style={styles.emptyTitle}>No Bets Awaiting Resolution</Text>
                <Text style={styles.emptyDescription}>
                  When your bets finish and need resolution, they'll appear here.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No {selectedFilter.toLowerCase()} Bets</Text>
                <Text style={styles.emptyDescription}>
                  You don't have any {selectedFilter.toLowerCase()} bets at the moment.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Bottom Stats */}
        <View style={styles.bottomStatsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{filteredBets.length}</Text>
              <Text style={styles.statLabel}>BETS</Text>
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
        <Text style={styles.invitationBetTitle}>{invitation.bet.title}</Text>
        <Text style={styles.invitationBetDescription} numberOfLines={2}>
          {invitation.bet.description}
        </Text>

        <View style={styles.invitationBetInfo}>
          {hasSpecificSide && (
            <View style={styles.invitationSideInfo}>
              <Text style={styles.invitationSideLabel}>Your side:</Text>
              <Text style={styles.invitationSideName}>{invitedSideName}</Text>
            </View>
          )}
          <View style={styles.invitationAmountInfo}>
            <Text style={styles.invitationAmountLabel}>Amount:</Text>
            <Text style={styles.invitationAmount}>${invitation.bet.betAmount || 0}</Text>
          </View>
        </View>

        {invitation.message && (
          <View style={styles.invitationMessage}>
            <Text style={styles.invitationMessageText}>"{invitation.message}"</Text>
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
                <Text style={[
                  styles.sideOptionText,
                  selectedSide === 'A' && styles.sideOptionTextSelected
                ]}>
                  {betOdds.sideAName}
                </Text>
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
                <Text style={[
                  styles.sideOptionText,
                  selectedSide === 'B' && styles.sideOptionTextSelected
                ]}>
                  {betOdds.sideBName}
                </Text>
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

  // Status Filters
  filtersContainer: {
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingTop: 0,
  },
  filtersScrollView: {
    paddingHorizontal: spacing.md,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  filterButtonTextActive: {
    color: colors.background,
  },
  filterBadge: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginLeft: spacing.xs,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeActive: {
    backgroundColor: colors.background,
  },
  filterBadgeText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  filterBadgeTextActive: {
    color: colors.primary,
  },
  
  // Section Header
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
  searchIconButton: {
    padding: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Search Input
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    textAlignVertical: 'center',
  },
  clearButton: {
    padding: spacing.xs / 2,
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
  invitationBetTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
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
    ...textStyles.h4,
    color: colors.textPrimary,
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
  sideOptionText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },
  sideOptionTextSelected: {
    color: colors.primary,
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
