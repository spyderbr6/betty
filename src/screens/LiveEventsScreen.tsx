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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { SquaresGameCard } from '../components/betting/SquaresGameCard';
import { BetInviteModal } from '../components/ui/BetInviteModal';
import { Bet } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';
import { bulkLoadJoinableBetsWithParticipants, bulkLoadFriendsBetsWithParticipants, clearBulkLoadingCache } from '../services/bulkLoadingService';
import { QRScannerModal } from '../components/ui/QRScannerModal';
import { getUpcomingEventsFromCache } from '../services/eventCacheService';
import type { LiveEventData } from '../services/eventService';
import { formatTeamName } from '../utils/formatting';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BetsStackParamList } from '../types/navigation';

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
  isPrivate?: boolean;
  isInvited?: boolean;
  createdAt: string;
}

type BetsScreenNavigationProp = StackNavigationProp<BetsStackParamList, 'BetsList'>;

export const LiveEventsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<BetsScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [liveBets, setLiveBets] = useState<Bet[]>([]);
  const [squaresGames, setSquaresGames] = useState<SquaresGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'friends' | 'all'>('friends');
  const [contentType, setContentType] = useState<'bets' | 'squares'>('bets');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedBetForInvite, setSelectedBetForInvite] = useState<Bet | null>(null);

  // QR Scanner modal state
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Recommended events state
  const [recommendedEvents, setRecommendedEvents] = useState<LiveEventData[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchJoinableBets = async () => {
      try {
        setIsLoading(true);
        console.log(`🎯 Fetching ${viewMode} bets with bulk loading for user:`, user.userId);

        // Use appropriate bulk loading service based on view mode
        const joinableBets = viewMode === 'friends'
          ? await bulkLoadFriendsBetsWithParticipants(user.userId, {
              limit: 50, // Reasonable limit for live events
              useCache: true
            })
          : await bulkLoadJoinableBetsWithParticipants(user.userId, {
              limit: 50, // Reasonable limit for live events
              useCache: true
            });

        console.log(`✅ Bulk loaded ${joinableBets.length} ${viewMode} bets`);
        setLiveBets(joinableBets);
      } catch (error) {
        console.error(`❌ Error bulk loading ${viewMode} bets:`, error);
        // Use mock data as fallback
        setLiveBets(mockLiveBets);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchRecommendedEvents = async () => {
      try {
        console.log('🎯 Fetching upcoming events from cache');
        // Get first 5 upcoming events from cache (already deduplicated by cache service)
        const events = await getUpcomingEventsFromCache();
        const topEvents = events.slice(0, 5);

        console.log(`✅ Loaded ${topEvents.length} upcoming events`);
        setRecommendedEvents(topEvents);
      } catch (error) {
        console.error('❌ Error fetching upcoming events:', error);
      }
    };

    const fetchJoinableSquaresGames = async () => {
      if (!user?.userId) return;

      try {
        console.log(`🎯 Fetching joinable squares games (viewMode: ${viewMode})`);

        // Get user's purchases to filter out games they already joined
        const { data: userPurchases } = await client.models.SquaresPurchase.list({
          filter: { userId: { eq: user.userId } }
        });

        const joinedGameIds = new Set(
          (userPurchases || []).map(p => p.squaresGameId).filter(Boolean)
        );

        // Get user's pending invitations
        const { data: userInvitations } = await client.models.SquaresInvitation.list({
          filter: {
            toUserId: { eq: user.userId },
            status: { eq: 'PENDING' }
          }
        });

        const invitedGameIds = new Set(
          (userInvitations || []).map(inv => inv.squaresGameId).filter(Boolean)
        );

        console.log(`✅ Found ${invitedGameIds.size} pending invitations`);

        // If friends mode, get friend IDs first
        let friendUserIds: string[] = [];
        if (viewMode === 'friends') {
          const [friendships1, friendships2] = await Promise.all([
            client.models.Friendship.list({
              filter: { user1Id: { eq: user.userId } }
            }),
            client.models.Friendship.list({
              filter: { user2Id: { eq: user.userId } }
            })
          ]);

          const allFriendships = [
            ...(friendships1.data || []),
            ...(friendships2.data || [])
          ];

          friendUserIds = allFriendships.map(friendship =>
            friendship.user1Id === user.userId
              ? friendship.user2Id
              : friendship.user1Id
          ).filter(Boolean) as string[];

          console.log(`✅ Found ${friendUserIds.length} friends`);

          if (friendUserIds.length === 0) {
            // No friends, no games to show
            console.log('No friends found, skipping squares games fetch');
            setSquaresGames([]);
            return;
          }
        }

        // Fetch all ACTIVE squares games
        const { data: games } = await client.models.SquaresGame.list({
          filter: {
            status: { eq: 'ACTIVE' }
          }
        });

        // Filter to joinable games
        const joinableGames: SquaresGame[] = (games || [])
          .filter(game => {
            if (!game) return false;

            // Must not be creator
            if (game.creatorId === user.userId) return false;

            // Must not have already purchased squares
            if (joinedGameIds.has(game.id!)) return false;

            // If friends mode, must be created by a friend
            if (viewMode === 'friends' && !friendUserIds.includes(game.creatorId!)) {
              return false;
            }

            // Include private games ONLY if user is invited
            if (game.isPrivate && !invitedGameIds.has(game.id!)) {
              return false;
            }

            return true;
          })
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
            isPrivate: game.isPrivate || false,
            isInvited: invitedGameIds.has(game.id!),
            createdAt: game.createdAt || new Date().toISOString(),
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        console.log(`✅ Loaded ${joinableGames.length} joinable squares games`);
        setSquaresGames(joinableGames);
      } catch (error) {
        console.error('❌ Error fetching joinable squares games:', error);
      }
    };

    fetchJoinableBets();
    fetchRecommendedEvents();
    fetchJoinableSquaresGames();

    // Set up real-time subscription for bet changes
    const betSubscription = client.models.Bet.observeQuery({
      filter: {
        status: { eq: 'ACTIVE' }
      }
    }).subscribe({
      next: async () => {
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
      next: async () => {
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
  }, [user, viewMode]); // Re-fetch when viewMode changes

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      if (!user) return;

      console.log(`🔄 Refreshing content (type: ${contentType}, view: ${viewMode})`);

      // Refresh bets
      const joinableBets = viewMode === 'friends'
        ? await bulkLoadFriendsBetsWithParticipants(user.userId, {
            limit: 50,
            forceRefresh: true // Bypass cache on manual refresh
          })
        : await bulkLoadJoinableBetsWithParticipants(user.userId, {
            limit: 50,
            forceRefresh: true // Bypass cache on manual refresh
          });

      console.log(`✅ Refreshed ${joinableBets.length} ${viewMode} bets`);
      setLiveBets(joinableBets);

      // Refresh squares games
      const { data: userPurchases } = await client.models.SquaresPurchase.list({
        filter: { userId: { eq: user.userId } }
      });

      const joinedGameIds = new Set(
        (userPurchases || []).map(p => p.squaresGameId).filter(Boolean)
      );

      // Get user's pending invitations
      const { data: userInvitations } = await client.models.SquaresInvitation.list({
        filter: {
          toUserId: { eq: user.userId },
          status: { eq: 'PENDING' }
        }
      });

      const invitedGameIds = new Set(
        (userInvitations || []).map(inv => inv.squaresGameId).filter(Boolean)
      );

      // If friends mode, get friend IDs first
      let friendUserIds: string[] = [];
      if (viewMode === 'friends') {
        const [friendships1, friendships2] = await Promise.all([
          client.models.Friendship.list({
            filter: { user1Id: { eq: user.userId } }
          }),
          client.models.Friendship.list({
            filter: { user2Id: { eq: user.userId } }
          })
        ]);

        const allFriendships = [
          ...(friendships1.data || []),
          ...(friendships2.data || [])
        ];

        friendUserIds = allFriendships.map(friendship =>
          friendship.user1Id === user.userId
            ? friendship.user2Id
            : friendship.user1Id
        ).filter(Boolean) as string[];

        if (friendUserIds.length === 0) {
          setSquaresGames([]);
          return;
        }
      }

      const { data: games } = await client.models.SquaresGame.list({
        filter: { status: { eq: 'ACTIVE' } }
      });

      const joinableGames: SquaresGame[] = (games || [])
        .filter(game => {
          if (!game) return false;
          if (game.creatorId === user.userId) return false;
          if (joinedGameIds.has(game.id!)) return false;
          if (viewMode === 'friends' && !friendUserIds.includes(game.creatorId!)) {
            return false;
          }
          // Include private games ONLY if user is invited
          if (game.isPrivate && !invitedGameIds.has(game.id!)) {
            return false;
          }
          return true;
        })
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
          isPrivate: game.isPrivate || false,
          isInvited: invitedGameIds.has(game.id!),
          createdAt: game.createdAt || new Date().toISOString(),
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log(`✅ Refreshed ${joinableGames.length} joinable squares games`);
      setSquaresGames(joinableGames);

      // Note: Recommended events use 24h cache and won't refresh on pull-to-refresh
      // This is intentional to avoid excessive API calls
    } catch (error) {
      console.error(`❌ Error refreshing content:`, error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleBetPress = (bet: Bet) => {
    console.log('Joinable bet pressed:', bet.title);
    // Navigate to bet details
  };

  const handleSquaresGamePress = (game: SquaresGame) => {
    console.log('Squares game pressed:', game.title);
    navigation.navigate('SquaresGameDetail', { gameId: game.id });
  };

  const handleJoinBet = (betId: string, side: string, amount: number) => {
    console.log(`User joined bet ${betId} on side ${side} with $${amount}`);
    // Bet will be automatically updated via subscription and moved from joinable list
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  // Removed - Header handles notifications internally now

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchToggle = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery(''); // Clear search when hiding
    }
  };

  const handleBetScanned = async (betId: string) => {
    console.log('Bet scanned:', betId);
    // TODO: Navigate to bet details or join flow for scanned bet
    // For now, just find it in the list and highlight it
    const scannedBet = liveBets.find(bet => bet.id === betId);
    if (scannedBet) {
      console.log('Found scanned bet:', scannedBet.title);
      // Could navigate to bet details or show join options
    }
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

  // Filter squaresGames by search query
  const filteredSquaresGames = squaresGames.filter(game => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const titleMatch = game.title.toLowerCase().includes(query);
      const descriptionMatch = game.description?.toLowerCase().includes(query);
      return titleMatch || descriptionMatch;
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
        variant="default"
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
        {/* Content Type Filter */}
        <View style={styles.contentTypeFilterContainer}>
          <TouchableOpacity
            style={[
              styles.contentTypeButton,
              contentType === 'bets' && styles.contentTypeButtonActive
            ]}
            onPress={() => setContentType('bets')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.contentTypeButtonText,
              contentType === 'bets' && styles.contentTypeButtonTextActive
            ]}>
              Bets
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.contentTypeButton,
              contentType === 'squares' && styles.contentTypeButtonActive
            ]}
            onPress={() => setContentType('squares')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.contentTypeButtonText,
              contentType === 'squares' && styles.contentTypeButtonTextActive
            ]}>
              Squares
            </Text>
          </TouchableOpacity>
        </View>

        {/* Friends' Bets Section */}
        <View style={styles.liveBetsSection}>
          <View style={styles.sectionHeader}>
            {/* View Mode Toggle with Action Icons */}
            <View style={styles.toggleWithActionsContainer}>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    viewMode === 'friends' && styles.toggleButtonActive
                  ]}
                  onPress={() => setViewMode('friends')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="people"
                    size={16}
                    color={viewMode === 'friends' ? colors.background : colors.textSecondary}
                  />
                  <Text style={[
                    styles.toggleButtonText,
                    viewMode === 'friends' && styles.toggleButtonTextActive
                  ]}>
                    Friends
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    styles.toggleButtonLast,
                    viewMode === 'all' && styles.toggleButtonActive
                  ]}
                  onPress={() => setViewMode('all')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="globe"
                    size={16}
                    color={viewMode === 'all' ? colors.background : colors.textSecondary}
                  />
                  <Text style={[
                    styles.toggleButtonText,
                    viewMode === 'all' && styles.toggleButtonTextActive
                  ]}>
                    All
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action Icons */}
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => setShowQRScanner(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionIconButton}
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
            </View>

            <Text style={styles.sectionSubtitle}>
              {contentType === 'bets' ? liveBets.length : squaresGames.length} available to join • Real-time updates
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
                  placeholder={contentType === 'bets'
                    ? (viewMode === 'friends' ? "Search friends' bets..." : "Search all bets...")
                    : "Search squares games..."}
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
              <Text style={styles.loadingText}>Loading joinable {contentType}...</Text>
            </View>
          ) : contentType === 'bets' ? (
            filteredLiveBets.length > 0 ? (
              filteredLiveBets.map((bet) => (
                <BetCard
                  key={bet.id}
                  bet={bet}
                  onPress={handleBetPress}
                  onJoinBet={handleJoinBet}
                  onInviteFriends={(bet) => {
                    setSelectedBetForInvite(bet);
                    setShowInviteModal(true);
                  }}
                />
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {searchQuery.trim() ? 'No Matching Bets' : viewMode === 'friends' ? 'No Friends\' Bets' : 'No Joinable Bets'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {searchQuery.trim()
                    ? `No bets match "${searchQuery}". Try a different search term.`
                    : viewMode === 'friends'
                      ? 'Your friends haven\'t created any bets you can join yet. Try switching to "All" to see bets from everyone!'
                      : 'All current bets are either yours or you\'ve already joined them. Check back later for new opportunities!'
                  }
                </Text>
              </View>
            )
          ) : (
            filteredSquaresGames.length > 0 ? (
              filteredSquaresGames.map((game) => (
                <SquaresGameCard
                  key={game.id}
                  squaresGame={game}
                  onPress={() => handleSquaresGamePress(game)}
                />
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {searchQuery.trim() ? 'No Matching Squares' : 'No Joinable Squares'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {searchQuery.trim()
                    ? `No squares games match "${searchQuery}". Try a different search term.`
                    : 'All current squares games are either yours or you\'ve already purchased squares. Check back later for new games!'
                  }
                </Text>
              </View>
            )
          )}
        </View>

        {/* Joinable Bets Stats Summary - Always show overall stats, not filtered */}
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

        {/* Recommended Upcoming Events based on check-in history */}
        {recommendedEvents.length > 0 && (
          <View style={styles.upcomingSection}>
            <Text style={styles.sectionTitle}>RECOMMENDED FOR YOU</Text>
            <Text style={styles.sectionSubtitle}>
              Based on your recent check-ins
            </Text>
            {recommendedEvents.map((event) => {
              const eventDate = new Date(event.scheduledTime);
              const now = new Date();
              const hoursUntil = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60));
              const daysUntil = Math.floor(hoursUntil / 24);

              // Check if event is currently live or in halftime
              const isLive = event.status === 'LIVE' || event.status === 'HALFTIME';

              let timeText = '';
              if (isLive) {
                // Show LIVE status with current score
                timeText = event.status === 'HALFTIME' ? '🔴 HALFTIME' : '🔴 LIVE NOW';
              } else if (daysUntil > 1) {
                timeText = `${daysUntil} days • ${eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
              } else if (daysUntil === 1) {
                timeText = `Tomorrow • ${eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
              } else if (hoursUntil > 2) {
                timeText = `Today • ${eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
              } else if (hoursUntil > 0) {
                timeText = `In ${hoursUntil}h`;
              } else {
                timeText = 'Starting soon';
              }

              const awayShort = formatTeamName(event.awayTeam, event.awayTeamShortName, event.awayTeamCode);
              const homeShort = formatTeamName(event.homeTeam, event.homeTeamShortName, event.homeTeamCode);

              return (
                <View
                  key={event.id}
                  style={[
                    styles.upcomingEvent,
                    isLive && styles.upcomingEventLive
                  ]}
                >
                  <View style={styles.upcomingHeader}>
                    <Text style={styles.upcomingTitle}>
                      {awayShort} @ {homeShort}
                    </Text>
                    <Text style={[
                      styles.upcomingStatus,
                      isLive && styles.upcomingStatusLive
                    ]}>
                      {event.sport}
                    </Text>
                  </View>
                  <View style={styles.upcomingTimeContainer}>
                    <Text style={[
                      styles.upcomingTime,
                      isLive && styles.upcomingTimeLive
                    ]}>
                      {timeText}
                    </Text>
                    {isLive && event.quarter && (
                      <Text style={styles.upcomingQuarter}>• {event.quarter}</Text>
                    )}
                  </View>
                  {isLive && (
                    <View style={styles.liveScoreContainer}>
                      <View style={styles.scoreRow}>
                        <Text style={styles.scoreTeam}>{awayShort}</Text>
                        <Text style={styles.scoreValue}>{event.awayScore}</Text>
                      </View>
                      <View style={styles.scoreRow}>
                        <Text style={styles.scoreTeam}>{homeShort}</Text>
                        <Text style={styles.scoreValue}>{event.homeScore}</Text>
                      </View>
                    </View>
                  )}
                  {event.venue && (
                    <Text style={styles.upcomingLocation}>
                      📍 {event.venue}{event.city ? ` • ${event.city}` : ''}
                    </Text>
                  )}
                  {event.checkInCount > 0 && (
                    <Text style={styles.upcomingCheckins}>
                      👥 {event.checkInCount} {event.checkInCount === 1 ? 'person' : 'people'} checked in
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
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
        />
      )}

      {/* QR Scanner Modal */}
      <QRScannerModal
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onBetScanned={handleBetScanned}
      />
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

  // Content Type Filter
  contentTypeFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  contentTypeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentTypeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  contentTypeButtonText: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: 14,
  },
  contentTypeButtonTextActive: {
    color: colors.background,
  },

  // Sections
  liveBetsSection: {
    padding: spacing.md,
  },
  sectionHeader: {
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  toggleWithActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconButton: {
    padding: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginLeft: spacing.xs,
  },

  // View Mode Toggle
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    padding: spacing.xs / 2,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    marginRight: spacing.sm,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm, // Increased from spacing.xs for better mobile tap target
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.radius.xs,
    marginRight: spacing.xs / 2,
  },
  toggleButtonLast: {
    marginRight: 0,
  },
  toggleButtonActive: {
    backgroundColor: colors.primary,
  },
  toggleButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs / 2,
    fontSize: 13,
    fontWeight: typography.fontWeight.medium,
  },
  toggleButtonTextActive: {
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
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
  sectionTitle: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.xs,
    letterSpacing: typography.letterSpacing.wider,
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
  upcomingEventLive: {
    borderLeftColor: colors.live,
    borderColor: colors.live + '40', // 25% opacity
    backgroundColor: colors.live + '08', // 3% opacity for subtle tint
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
  upcomingStatusLive: {
    color: colors.live,
    backgroundColor: colors.live + '20', // 12% opacity
  },
  upcomingTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  upcomingTime: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  upcomingTimeLive: {
    color: colors.live,
    fontWeight: typography.fontWeight.bold,
  },
  upcomingQuarter: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
    fontSize: 12,
  },
  liveScoreContainer: {
    backgroundColor: colors.background,
    borderRadius: spacing.radius.xs,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  scoreTeam: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: typography.fontWeight.medium,
  },
  scoreValue: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  upcomingLocation: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  upcomingCheckins: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
});
