/**
 * Bets Screen
 * Main betting screen showing active bets list
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { commonStyles, colors, spacing, typography, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { Bet } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';

// Initialize GraphQL client
const client = generateClient<Schema>();

// Helper function to transform Amplify data to our Bet type
const transformAmplifyBet = (bet: any): Bet | null => {
  // Skip bets with missing required fields
  if (!bet.id || !bet.title || !bet.description || !bet.category || !bet.status) {
    return null;
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
    odds: typeof bet.odds === 'object' && bet.odds ? bet.odds : { sideA: -110, sideB: 110 },
    deadline: bet.deadline || new Date().toISOString(),
    winningSide: bet.winningSide || undefined,
    resolutionReason: bet.resolutionReason || undefined,
    createdAt: bet.createdAt || new Date().toISOString(),
    updatedAt: bet.updatedAt || new Date().toISOString(),
    participants: [], // Will be populated by separate query if needed
  };
};

// Keeping mock data as fallback for development
const mockBets: Bet[] = [
  {
    id: '1',
    title: 'Next 3PT Made',
    description: 'LeBron James makes next 3-point attempt',
    category: 'SPORTS',
    status: 'LIVE',
    creatorId: 'user1',
    totalPot: 50,
    betAmount: 25,
    odds: {
      sideA: -110,
      sideB: +150,
      sideAName: 'Yes',
      sideBName: 'No',
    },
    deadline: new Date(Date.now() + 1800000).toISOString(), // 30 minutes from now
    createdAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '1', 
        betId: '1', 
        userId: 'user1', 
        side: 'A', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '2', 
        betId: '1', 
        userId: 'user2', 
        side: 'B', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
  {
    id: '2',
    title: 'Next Foul',
    description: 'Which team commits next foul?',
    category: 'SPORTS',
    status: 'PENDING_RESOLUTION',
    creatorId: 'user2',
    totalPot: 50,
    betAmount: 25,
    odds: {
      sideA: -105,
      sideB: +125,
      sideAName: 'LAL',
      sideBName: 'GSW',
    },
    deadline: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    createdAt: new Date(Date.now() - 1200000).toISOString(), // 20 minutes ago
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '3', 
        betId: '2', 
        userId: 'user1', 
        side: 'A', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '4', 
        betId: '2', 
        userId: 'user3', 
        side: 'B', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
  {
    id: '3',
    title: 'Final Result',
    description: 'Lakers vs Warriors moneyline',
    category: 'SPORTS',
    status: 'ACTIVE',
    creatorId: 'user3',
    totalPot: 200,
    betAmount: 100,
    odds: {
      sideA: +125,
      sideB: -145,
      sideAName: 'LAL',
      sideBName: 'GSW',
    },
    deadline: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '5', 
        betId: '3', 
        userId: 'user1', 
        side: 'A', 
        amount: 100, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '6', 
        betId: '3', 
        userId: 'user2', 
        side: 'B', 
        amount: 100, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
];

export const BetsScreen: React.FC = () => {
  const { user } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ACTIVE' | 'LIVE' | 'PENDING_RESOLUTION' | 'RESOLVED'>('ALL');

  useEffect(() => {
    // Fetch initial bet data and set up real-time subscriptions
    const fetchBets = async () => {
      try {
        setIsLoading(true);

        // Query for active bets with participants
        const { data: betsData } = await client.models.Bet.list({
          filter: {
            or: [
              { status: { eq: 'ACTIVE' } },
              { status: { eq: 'LIVE' } },
              { status: { eq: 'PENDING_RESOLUTION' } }
            ]
          }
        });

        if (betsData) {
          // Fetch participants for each bet
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
          setBets(validBets);
        }
      } catch (error) {
        console.error('Error fetching bets:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBets();

    // Set up real-time subscription for bet changes
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        or: [
          { status: { eq: 'ACTIVE' } },
          { status: { eq: 'LIVE' } },
          { status: { eq: 'PENDING_RESOLUTION' } }
        ]
      }
    }).subscribe({
      next: async (data) => {
        console.log('Real-time bet update:', data);
        await updateBetsWithParticipants(data.items);
      },
      error: (error) => {
        console.error('Real-time bet subscription error:', error);
      }
    });

    // Set up real-time subscription for participant changes
    const participantSubscription = client.models.Participant.observeQuery().subscribe({
      next: async (participantData) => {
        console.log('Real-time participant update:', participantData);

        // Refetch all bets when participants change
        const { data: betsData } = await client.models.Bet.list({
          filter: {
            or: [
              { status: { eq: 'ACTIVE' } },
              { status: { eq: 'LIVE' } },
              { status: { eq: 'PENDING_RESOLUTION' } }
            ]
          }
        });

        if (betsData) {
          await updateBetsWithParticipants(betsData);
        }
      },
      error: (error) => {
        console.error('Real-time participant subscription error:', error);
      }
    });

    // Helper function to update bets with participants
    const updateBetsWithParticipants = async (betItems: any[]) => {
      const betsWithParticipants = await Promise.all(
        betItems.map(async (bet) => {
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
      setBets(validBets);
    };

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

  const handleFilterPress = () => {
    console.log('Filter pressed');
    // Show filter modal
  };

  const handleCreateBetPress = () => {
    console.log('Create bet pressed');
    // Navigate to create bet screen
  };

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
    if (selectedFilter === 'ALL') {
      return ['ACTIVE', 'LIVE', 'PENDING_RESOLUTION', 'RESOLVED'].includes(bet.status);
    }

    return bet.status === selectedFilter;
  });

  // Status filter options
  const statusFilters = [
    { id: 'ALL', label: 'All', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && ['ACTIVE', 'LIVE', 'PENDING_RESOLUTION', 'RESOLVED'].includes(bet.status);
    }).length },
    { id: 'ACTIVE', label: 'Active', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && bet.status === 'ACTIVE';
    }).length },
    { id: 'LIVE', label: 'Live', count: bets.filter(bet => {
      const isCreator = bet.creatorId === user?.userId;
      const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
      return (isCreator || isParticipant) && bet.status === 'LIVE';
    }).length },
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
        onSearchChange={handleSearchChange}
        searchQuery={searchQuery}
        onFilterPress={handleFilterPress}
        showSearch={true}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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

        {/* My Bets Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>MY BETS</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateBetPress}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>+ NEW BET</Text>
          </TouchableOpacity>
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
            <Text style={styles.emptyTitle}>No {selectedFilter === 'ALL' ? 'My' : selectedFilter.toLowerCase()} Bets</Text>
            <Text style={styles.emptyDescription}>
              {selectedFilter === 'ALL'
                ? "You haven't created or joined any bets yet. Tap 'Create' to get started!"
                : `You don't have any ${selectedFilter.toLowerCase()} bets at the moment.`
              }
            </Text>
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

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },

  // Status Filters
  filtersContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
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
  createButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
  },
  createButtonText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
});