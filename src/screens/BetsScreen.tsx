/**
 * Bets Screen
 * Main betting screen showing active bets list
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { commonStyles, colors, spacing, typography, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { BetList } from '../components/betting/BetList';
import { Bet } from '../types/betting';

// Mock data for development
const mockBets: Bet[] = [
  {
    id: '1',
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
  const [bets] = useState<Bet[]>(mockBets);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
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

  // Mock user data
  const currentUser = {
    winRate: 67.3,
    totalBets: 23,
    totalWinnings: 1245.75,
    trustScore: 8.4,
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
    liveBetsCount: 12,
  };

  const activeBets = bets.filter(bet => ['ACTIVE', 'LIVE', 'PENDING_RESOLUTION'].includes(bet.status));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        balance={currentUser.totalWinnings}
        onBalancePress={handleBalancePress}
        onNotificationsPress={handleNotificationsPress}
        notificationCount={2}
        liveGame={liveGame}
        onSearchChange={handleSearchChange}
        searchQuery={searchQuery}
        onFilterPress={handleFilterPress}
        showSearch={true}
      />
      
      <View style={styles.content}>
        {/* Active Bets Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACTIVE BETS</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateBetPress}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>+ NEW BET</Text>
          </TouchableOpacity>
        </View>
        
        <BetList
          bets={activeBets}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onBetPress={handleBetPress}
          showSearch={false}
          showFilters={false}
          emptyTitle="No active bets"
          emptyDescription="Create your first bet or join others!"
        />
        
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>WIN RATE</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {currentUser.winRate}%
            </Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL BETS</Text>
            <Text style={styles.statValue}>{currentUser.totalBets}</Text>
          </View>
          
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TRUST SCORE</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {currentUser.trustScore}
            </Text>
          </View>
        </View>
      </View>
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
  
  // Quick Stats
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    borderRadius: spacing.radius.sm,
    alignItems: 'center',
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.xl,
    textAlign: 'center',
  },
});