/**
 * Live Events Screen
 * Professional live betting interface with real-time prop bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
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

// Mock live bets data as fallback
const mockLiveBets: Bet[] = [
  {
    id: 'live1',
    title: 'Next 3PT Made',
    description: 'LeBron James makes next 3-point attempt',
    category: 'SPORTS',
    status: 'LIVE',
    creatorId: 'user1',
    totalPot: 50,
    odds: {
      sideA: -110,
      sideB: +150,
      sideAName: 'Yes',
      sideBName: 'No',
    },
    deadline: new Date(Date.now() + 300000).toISOString(), // 5 minutes from now
    createdAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '1', 
        betId: 'live1', 
        userId: 'user1', 
        side: 'A', 
        amount: 25, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '2', 
        betId: 'live1', 
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
    id: 'live2',
    title: 'Next Timeout Called',
    description: 'Which team calls the next timeout?',
    category: 'SPORTS',
    status: 'LIVE',
    creatorId: 'user2',
    totalPot: 75,
    odds: {
      sideA: +120,
      sideB: -140,
      sideAName: 'Lakers',
      sideBName: 'Warriors',
    },
    deadline: new Date(Date.now() + 900000).toISOString(), // 15 minutes from now
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [
      { 
        id: '3', 
        betId: 'live2', 
        userId: 'user3', 
        side: 'A', 
        amount: 30, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
      { 
        id: '4', 
        betId: 'live2', 
        userId: 'user4', 
        side: 'B', 
        amount: 45, 
        status: 'ACCEPTED', 
        payout: 0, 
        joinedAt: new Date().toISOString() 
      },
    ],
  },
];

export const LiveEventsScreen: React.FC = () => {
  const { user } = useAuth();
  const [liveBets, setLiveBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchJoinableBets = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching joinable bets for user:', user.userId);

        // Fetch all active bets
        const { data: betsData } = await client.models.Bet.list({
          filter: {
            status: { eq: 'ACTIVE' }
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

          // Filter to show only joinable bets (user not creator and not participant)
          const joinableBets = validBets.filter(bet => {
            const isCreator = bet.creatorId === user.userId;
            const isParticipant = bet.participants?.some(p => p.userId === user.userId);
            return !isCreator && !isParticipant;
          });

          console.log('Found joinable bets:', joinableBets.length);
          setLiveBets(joinableBets);
        }
      } catch (error) {
        console.error('Error fetching joinable bets:', error);
        // Use mock data as fallback
        setLiveBets(mockLiveBets);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJoinableBets();

    // Set up real-time subscription for bet changes
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        status: { eq: 'ACTIVE' }
      }
    }).subscribe({
      next: async (data) => {
        console.log('Real-time joinable bet update:', data);
        await updateJoinableBets(data.items);
      },
      error: (error) => {
        console.error('Real-time joinable bet subscription error:', error);
      }
    });

    // Set up real-time subscription for participant changes
    const participantSubscription = client.models.Participant.observeQuery().subscribe({
      next: async (participantData) => {
        console.log('Real-time participant update (joinable bets):', participantData);
        // Refetch joinable bets when participants change
        await fetchJoinableBets();
      },
      error: (error) => {
        console.error('Real-time participant subscription error (joinable):', error);
      }
    });

    // Helper function to update joinable bets with participants
    const updateJoinableBets = async (betItems: any[]) => {
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
      // Filter to show only joinable bets
      const joinableBets = validBets.filter(bet => {
        const isCreator = bet.creatorId === user?.userId;
        const isParticipant = bet.participants?.some(p => p.userId === user?.userId);
        return !isCreator && !isParticipant;
      });

      setLiveBets(joinableBets);
    };

    // Cleanup subscriptions on unmount
    return () => {
      betSubscription.unsubscribe();
      participantSubscription.unsubscribe();
    };
  }, [user]);

  const handleBetPress = (bet: Bet) => {
    console.log('Joinable bet pressed:', bet.title);
    // Navigate to bet details
  };

  const handleJoinBet = (betId: string, side: string, amount: number) => {
    console.log(`User joined bet ${betId} on side ${side} with $${amount}`);
    // Bet will be automatically updated via subscription and moved from joinable list
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  const handleNotificationsPress = () => {
    console.log('Notifications pressed');
  };

  // Mock live game data
  const liveGame = {
    homeTeam: 'LAL',
    awayTeam: 'GSW',
    homeScore: 89,
    awayScore: 92,
    quarter: 'Q3',
    timeLeft: '8:42',
    venue: 'Crypto.com Arena',
    liveBetsCount: liveBets.length,
  };



  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
        onNotificationsPress={handleNotificationsPress}
        notificationCount={3}
        liveGame={liveGame}
        variant="default"
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Joinable Bets Section */}
        <View style={styles.liveBetsSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>JOINABLE BETS</Text>
              <Text style={styles.sectionSubtitle}>
                {liveBets.length} available to join • Real-time updates
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>↻ REFRESH</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading joinable bets...</Text>
            </View>
          ) : liveBets.length > 0 ? (
            liveBets.map((bet) => (
              <BetCard
                key={bet.id}
                bet={bet}
                onPress={handleBetPress}
                onJoinBet={handleJoinBet}
                showJoinOptions={true}
              />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Joinable Bets</Text>
              <Text style={styles.emptyDescription}>
                All current bets are either yours or you've already joined them. Check back later for new opportunities!
              </Text>
            </View>
          )}
        </View>

        {/* Joinable Bets Stats Summary */}
        <View style={styles.liveStatsSection}>
          <Text style={styles.sectionTitle}>BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>${liveBets.reduce((sum, bet) => sum + (bet.totalPot || 0), 0)}</Text>
              <Text style={styles.statLabel}>TOTAL AVAILABLE POT</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{liveBets.reduce((sum, bet) => sum + (bet.participants?.length || 0), 0)}</Text>
              <Text style={styles.statLabel}>ACTIVE BETTORS</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{liveBets.length}</Text>
              <Text style={styles.statLabel}>BETS AVAILABLE</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{liveBets.length > 0 ? Math.round(liveBets.reduce((sum, bet) => sum + (bet.betAmount || 0), 0) / liveBets.length) : 0}</Text>
              <Text style={styles.statLabel}>AVG BET AMOUNT</Text>
            </View>
          </View>
        </View>

        {/* Upcoming Events */}
        <View style={styles.upcomingSection}>
          <Text style={styles.sectionTitle}>NEXT LIVE EVENTS</Text>
          <View style={styles.upcomingEvent}>
            <View style={styles.upcomingHeader}>
              <Text style={styles.upcomingTitle}>Clippers vs Suns</Text>
              <Text style={styles.upcomingStatus}>PREGAME</Text>
            </View>
            <Text style={styles.upcomingTime}>Tomorrow 7:30 PM PST</Text>
            <Text style={styles.upcomingLocation}>📍 Footprint Center • Phoenix, AZ</Text>
          </View>
          
          <View style={styles.upcomingEvent}>
            <View style={styles.upcomingHeader}>
              <Text style={styles.upcomingTitle}>Dodgers vs Giants</Text>
              <Text style={styles.upcomingStatus}>SCHEDULED</Text>
            </View>
            <Text style={styles.upcomingTime}>Friday 7:10 PM PST</Text>
            <Text style={styles.upcomingLocation}>📍 Dodger Stadium • Los Angeles, CA</Text>
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
  
  
  // Sections
  liveBetsSection: {
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: 4,
    fontWeight: typography.fontWeight.bold,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  refreshButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshButtonText: {
    ...textStyles.caption,
    color: colors.primary,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
  
  // Live Stats
  liveStatsSection: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.background,
    padding: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...textStyles.h3,
    color: colors.primary,
    marginBottom: 4,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
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
  
  // Upcoming events
  upcomingSection: {
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  upcomingEvent: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.pending,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  upcomingTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    flex: 1,
  },
  upcomingStatus: {
    ...textStyles.caption,
    color: colors.pending,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  upcomingTime: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  upcomingLocation: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
});