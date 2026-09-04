/**
 * Live Events Screen
 * Professional live betting interface with real-time prop bets
 */

import React, { useState, useEffect, useMemo } from 'react';
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
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { SquaresGameCard } from '../components/betting/SquaresGameCard';
import { BetInviteModal } from '../components/ui/BetInviteModal';
import { Bet } from '../types/betting';
import { useAuth } from '../contexts/AuthContext';
import { useBetData } from '../contexts/BetDataContext';
import { useEventCheckIn } from '../hooks/useEventCheckIn';
import { QRScannerModal } from '../components/ui/QRScannerModal';
import { getUpcomingEventsFromCache } from '../services/eventCacheService';
import type { LiveEventData } from '../services/eventService';
import { formatTeamName } from '../utils/formatting';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BetsStackParamList } from '../types/navigation';

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
  createdAt: string;
}

/**
 * A joinable item of either kind, plus whether it belongs to the event the
 * viewer is currently checked into. Discriminated on `kind` so the list renders
 * from one array instead of branching on a screen-level content-type toggle.
 */
type FeedItem =
  | { kind: 'bet'; id: string; bet: Bet; createdAt: string; atMyEvent: boolean }
  | { kind: 'squares'; id: string; game: SquaresGame; createdAt: string; atMyEvent: boolean };

type BetsScreenNavigationProp = StackNavigationProp<BetsStackParamList, 'BetsList'>;

export const LiveEventsScreen: React.FC = () => {
  const { user } = useAuth();
  const {
    joinableFriendsBets,
    joinableFriendsSquaresGames: friendsJoinableSquares,
    isInitialLoading,
    isRefreshing,
    refresh,
  } = useBetData();
  const { checkedInEvent } = useEventCheckIn();
  const navigation = useNavigation<BetsScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  // The friends/all and bets/squares toggles are gone. Both were selections
  // between pre-computed arrays rather than queries, which is why every state
  // combination had to be resolved in JSX. One list, one loading state, one
  // empty state -- items carry their own type and event affinity instead.

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedBetForInvite, setSelectedBetForInvite] = useState<Bet | null>(null);

  // QR Scanner modal state
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Recommended events state
  const [recommendedEvents, setRecommendedEvents] = useState<LiveEventData[]>([]);

  const liveBets = joinableFriendsBets;
  const squaresGames = friendsJoinableSquares;
  const isLoading = isInitialLoading;
  const refreshing = isRefreshing;

  // Fetch recommended events (stays local — not part of bet data)
  useEffect(() => {
    const fetchRecommendedEvents = async () => {
      try {
        const events = await getUpcomingEventsFromCache();
        setRecommendedEvents(events.slice(0, 5));
      } catch (error) {
        console.error('Error fetching upcoming events:', error);
      }
    };
    if (user) fetchRecommendedEvents();
  }, [user]);

  const onRefresh = async () => {
    await refresh();
  };

  const handleBetPress = (bet: Bet) => {
    console.log('Joinable bet pressed:', bet.title);
    // Navigate to bet details
  };

  const handleSquaresGamePress = (game: SquaresGame) => {
    console.log('Squares game pressed:', game.title);
    navigation.navigate('SquaresGameDetail', { gameId: game.id });
  };

  const handleJoinBet = () => {
    // Join is now handled by BetCard via context — this callback is for compatibility
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

  const query = searchQuery.trim().toLowerCase();

  /**
   * One list, both item kinds. The card to render is chosen from `kind` rather
   * than from a screen-level toggle, and `atMyEvent` marks the items tied to the
   * event the viewer is checked into so the card can lead with them.
   *
   * Items already joined, already owned, private-and-uninvited, or past their
   * deadline are excluded upstream in BetDataContext.
   */
  const feedItems: FeedItem[] = useMemo(() => {
    const matches = (...fields: (string | undefined)[]) =>
      !query || fields.some(f => f?.toLowerCase().includes(query));

    const items: FeedItem[] = [
      ...liveBets
        .filter(bet => matches(bet.title, bet.description, bet.odds.sideAName, bet.odds.sideBName))
        .map(bet => ({
          kind: 'bet' as const,
          id: bet.id,
          bet,
          createdAt: bet.createdAt,
          atMyEvent: Boolean(checkedInEvent?.id && bet.eventId === checkedInEvent.id),
        })),
      ...squaresGames
        .filter(game => matches(game.title, game.description))
        .map(game => ({
          kind: 'squares' as const,
          id: game.id,
          game,
          createdAt: game.createdAt,
          atMyEvent: Boolean(checkedInEvent?.id && game.eventId === checkedInEvent.id),
        })),
    ];

    // Items at the viewer's event first, then newest.
    return items.sort((a, b) => {
      if (a.atMyEvent !== b.atMyEvent) return a.atMyEvent ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [liveBets, squaresGames, query, checkedInEvent?.id]);

  const atEventCount = feedItems.filter(i => i.atMyEvent).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-live">
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
        {/* Header: what this list is, and the event context if there is one */}
        <View style={styles.feedHeader}>
          <View style={styles.toggleWithActionsContainer}>
            <View style={styles.feedTitleGroup}>
              <Text style={styles.feedTitle} testID="feed-title">FRIENDS' BETS</Text>
              {checkedInEvent && (
                <Text style={styles.feedEventLine} testID="feed-event-context">
                  {atEventCount > 0
                    ? `${atEventCount} at ${checkedInEvent.awayTeam} @ ${checkedInEvent.homeTeam}`
                    : `Checked in \u2022 ${checkedInEvent.awayTeam} @ ${checkedInEvent.homeTeam}`}
                </Text>
              )}
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={() => setShowQRScanner(true)}
                activeOpacity={0.7}
                testID="feed-qr"
              >
                <Ionicons name="qr-code-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={handleSearchToggle}
                activeOpacity={0.7}
                testID="feed-search-toggle"
              >
                <Ionicons name={showSearch ? 'close' : 'search'} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionSubtitle} testID="feed-count">
            {feedItems.length} available to join
          </Text>
        </View>

        {showSearch && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search friends' bets and squares..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus={true}
                testID="feed-search-input"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer} testID="feed-loading">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading bets from your friends...</Text>
          </View>
        ) : feedItems.length === 0 ? (
          <View style={styles.emptyContainer} testID="feed-empty">
            <Text style={styles.emptyTitle}>
              {query ? 'No Matches' : 'Nothing to Join Yet'}
            </Text>
            <Text style={styles.emptyDescription}>
              {query
                ? `Nothing matches "${searchQuery}". Try a different search term.`
                : "None of your friends have anything open right now. Check back once they've created a bet."}
            </Text>
          </View>
        ) : (
          <View testID="feed-list">
            {feedItems.map((item) => (
              <View
                key={item.id}
                style={item.atMyEvent ? styles.feedItemAtEvent : undefined}
                testID={item.atMyEvent ? `feed-item-at-event-${item.id}` : `feed-item-${item.id}`}
              >
                {item.atMyEvent && checkedInEvent && (
                  <View style={styles.atEventChip} testID={`feed-chip-${item.id}`}>
                    <Ionicons name="location" size={11} color={colors.background} />
                    <Text style={styles.atEventChipText}>
                      {checkedInEvent.awayTeamCode || checkedInEvent.awayTeam} @{' '}
                      {checkedInEvent.homeTeamCode || checkedInEvent.homeTeam}
                    </Text>
                  </View>
                )}
                {item.kind === 'bet' ? (
                  <BetCard
                    bet={item.bet}
                    onPress={handleBetPress}
                    onJoinBet={handleJoinBet}
                    onInviteFriends={(bet) => {
                      setSelectedBetForInvite(bet);
                      setShowInviteModal(true);
                    }}
                  />
                ) : (
                  <SquaresGameCard
                    squaresGame={item.game}
                    onPress={() => handleSquaresGamePress(item.game)}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Joinable Bets Stats Summary - Always show overall stats, not filtered */}
        <View style={styles.liveStatsSection}>
          <Text style={styles.sectionTitle}>BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>${liveBets.reduce((sum, bet) => sum + (bet.totalPot || 0), 0)}</Text>
              <Text style={styles.statLabel}>TOTAL AVAILABLE POT</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{liveBets.reduce((sum, bet) => sum + (bet.sideACount || 0) + (bet.sideBCount || 0), 0)}</Text>
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

  feedHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  feedTitleGroup: {
    flex: 1,
  },
  feedTitle: {
    ...textStyles.label,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  feedEventLine: {
    ...textStyles.caption,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  // Items tied to the event the viewer is checked into get an accent rail so
  // they read as "here, now" without being split into a separate section.
  feedItemAtEvent: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderTopRightRadius: spacing.radius.md,
    borderBottomRightRadius: spacing.radius.md,
    backgroundColor: colors.surfaceLight,
    marginBottom: spacing.sm,
  },
  atEventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginLeft: spacing.md,
    marginTop: spacing.sm,
  },
  atEventChipText: {
    ...textStyles.caption,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
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
