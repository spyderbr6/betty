/**
 * Live Events Screen
 * Professional live betting interface with real-time prop bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { Bet } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';
import { bulkLoadJoinableBetsWithParticipants, clearBulkLoadingCache } from '../services/bulkLoadingService';

// Initialize GraphQL client
const client = generateClient<Schema>();

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
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchJoinableBets = async () => {
      try {
        setIsLoading(true);
        console.log('🎯 Fetching joinable bets with bulk loading for user:', user.userId);

        // Use bulk loading service for efficient data fetching
        const joinableBets = await bulkLoadJoinableBetsWithParticipants(user.userId, {
          limit: 50, // Reasonable limit for live events
          useCache: true
        });

        console.log(`✅ Bulk loaded ${joinableBets.length} joinable bets`);
        setLiveBets(joinableBets);
      } catch (error) {
        console.error('❌ Error bulk loading joinable bets:', error);
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
        console.log('🔄 Real-time bet update detected, refreshing joinable bets');
        // Clear cache and refetch to get latest data
        clearBulkLoadingCache();
        await fetchJoinableBets();
      },
      error: (error) => {
        console.error('❌ Real-time bet subscription error:', error);
      }
    });

    // Set up real-time subscription for participant changes
    const participantSubscription = client.models.Participant.observeQuery().subscribe({
      next: async (participantData) => {
        console.log('🔄 Real-time participant update detected, refreshing joinable bets');
        // Clear cache and refetch to get latest data
        clearBulkLoadingCache();
        await fetchJoinableBets();
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
  }, [user]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      if (!user) return;

      console.log('🔄 Refreshing joinable bets with force refresh');

      // Use bulk loading with force refresh to bypass cache
      const joinableBets = await bulkLoadJoinableBetsWithParticipants(user.userId, {
        limit: 50,
        forceRefresh: true // Bypass cache on manual refresh
      });

      console.log(`✅ Refreshed ${joinableBets.length} joinable bets`);
      setLiveBets(joinableBets);
    } catch (error) {
      console.error('❌ Error refreshing joinable bets:', error);
    } finally {
      setRefreshing(false);
    }
  };

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

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchToggle = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery(''); // Clear search when hiding
    }
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

  // Filter liveBets by search query
  const filteredLiveBets = liveBets.filter(bet => {
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
        {/* Joinable Bets Section */}
        <View style={styles.liveBetsSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <Text style={styles.sectionTitle}>JOINABLE BETS</Text>
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
            <Text style={styles.sectionSubtitle}>
              {liveBets.length} available to join • Real-time updates
            </Text>
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
                  placeholder="Search joinable bets..."
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

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading joinable bets...</Text>
            </View>
          ) : filteredLiveBets.length > 0 ? (
            filteredLiveBets.map((bet) => (
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
              <Text style={styles.emptyTitle}>
                {searchQuery.trim() ? 'No Matching Bets' : 'No Joinable Bets'}
              </Text>
              <Text style={styles.emptyDescription}>
                {searchQuery.trim()
                  ? `No bets match "${searchQuery}". Try a different search term.`
                  : 'All current bets are either yours or you\'ve already joined them. Check back later for new opportunities!'
                }
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
    marginBottom: spacing.md,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
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
