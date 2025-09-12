/**
 * Live Events Screen
 * Professional live betting interface with real-time prop bets
 */

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, commonStyles, textStyles, spacing, typography } from '../styles';
import { Header } from '../components/ui/Header';
import { LiveBetCard } from '../components/betting/LiveBetCard';
import { Bet } from '../types/betting';

// Mock live bets data
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
  const [liveBets] = useState<Bet[]>(mockLiveBets);
  const [selectedQuickBet, setSelectedQuickBet] = useState<string>('props');

  const handleBetPress = (bet: Bet) => {
    console.log('Live bet pressed:', bet.title);
    // Navigate to live bet details
  };

  const handleQuickBet = (bet: Bet, side: string) => {
    console.log('Quick bet:', bet.title, 'side:', side);
    // Handle quick bet placement
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

  const quickBetCategories = [
    { id: 'props', label: 'PROPS', count: 12 },
    { id: 'period', label: 'PERIOD', count: 8 },
    { id: 'player', label: 'PLAYER', count: 15 },
    { id: 'team', label: 'TEAM', count: 6 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        balance={1245.75}
        onBalancePress={handleBalancePress}
        onNotificationsPress={handleNotificationsPress}
        notificationCount={3}
        liveGame={liveGame}
        variant="default"
      />
      
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Live Event Status Bar */}
        <View style={styles.liveStatusBar}>
          <View style={styles.liveIndicatorGroup}>
            <View style={styles.livePulse} />
            <Text style={styles.liveStatusText}>LIVE</Text>
          </View>
          <Text style={styles.liveEventText}>{liveGame.venue}</Text>
          <Text style={styles.liveBetCount}>{liveBets.length} LIVE BETS</Text>
        </View>

        {/* Quick Bet Categories */}
        <View style={styles.quickBetCategories}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickBetCategories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryButton,
                  selectedQuickBet === category.id && styles.categoryButtonActive
                ]}
                onPress={() => setSelectedQuickBet(category.id)}
              >
                <Text style={[
                  styles.categoryButtonText,
                  selectedQuickBet === category.id && styles.categoryButtonTextActive
                ]}>
                  {category.label}
                </Text>
                <Text style={[
                  styles.categoryButtonCount,
                  selectedQuickBet === category.id && styles.categoryButtonCountActive
                ]}>
                  {category.count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Live Prop Bets Section */}
        <View style={styles.liveBetsSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>LIVE PROP BETS</Text>
              <Text style={styles.sectionSubtitle}>
                {liveBets.length} active • Real-time odds
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>↻ REFRESH</Text>
            </TouchableOpacity>
          </View>
          
          {liveBets.map((bet) => (
            <LiveBetCard
              key={bet.id}
              bet={bet}
              onPress={handleBetPress}
              onQuickBet={handleQuickBet}
              showQuickBet={true}
            />
          ))}
        </View>

        {/* Live Stats Summary */}
        <View style={styles.liveStatsSection}>
          <Text style={styles.sectionTitle}>LIVE BETTING STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>$2,847</Text>
              <Text style={styles.statLabel}>TOTAL LIVE POT</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>124</Text>
              <Text style={styles.statLabel}>ACTIVE BETTORS</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>18</Text>
              <Text style={styles.statLabel}>PROPS AVAILABLE</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>3:42</Text>
              <Text style={styles.statLabel}>AVG BET TIME</Text>
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
  
  // Live Status Bar
  liveStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.live,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  liveIndicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  livePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    marginRight: spacing.xs,
  },
  liveStatusText: {
    ...textStyles.status,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  liveEventText: {
    ...textStyles.bodySmall,
    color: colors.background,
  },
  liveBetCount: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
  },
  
  // Quick Bet Categories
  quickBetCategories: {
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    marginLeft: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
  },
  categoryButtonTextActive: {
    color: colors.background,
  },
  categoryButtonCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    textAlign: 'center',
  },
  categoryButtonCountActive: {
    color: colors.primary,
    backgroundColor: colors.background,
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