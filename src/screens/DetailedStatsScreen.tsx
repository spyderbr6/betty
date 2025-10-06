/**
 * Detailed Stats Screen
 * Comprehensive betting analytics and performance metrics
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatPercentage } from '../utils/formatting';

const client = generateClient<Schema>();

interface DetailedStatsScreenProps {
  onClose: () => void;
}

interface BetStats {
  totalBets: number;
  activeBets: number;
  wonBets: number;
  lostBets: number;
  cancelledBets: number;
  totalWagered: number;
  totalWinnings: number;
  netProfit: number;
  winRate: number;
  averageBetSize: number;
  largestWin: number;
  largestLoss: number;
  currentStreak: { type: 'win' | 'loss' | 'none'; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
}

export const DetailedStatsScreen: React.FC<DetailedStatsScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<BetStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDetailedStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Fetch user's participations
      const { data: participations } = await client.models.Participant.list({
        filter: { userId: { eq: user.userId } }
      });

      // Fetch all related bets
      const betIds = [...new Set(participations?.map(p => p.betId) || [])];
      const bets = await Promise.all(
        betIds.map(async (betId) => {
          const { data } = await client.models.Bet.get({ id: betId! });
          return data;
        })
      );

      const validBets = bets.filter(b => b !== null && b !== undefined);
      const userParticipations = participations || [];

      // Calculate statistics
      const activeBets = validBets.filter(b => b.status === 'ACTIVE').length;
      const resolvedBets = validBets.filter(b => b.status === 'RESOLVED');

      let wonBets = 0;
      let lostBets = 0;
      let totalWagered = 0;
      let totalWinnings = 0;
      let largestWin = 0;
      let largestLoss = 0;

      resolvedBets.forEach(bet => {
        const participation = userParticipations.find(p => p.betId === bet.id);
        if (participation) {
          totalWagered += participation.amount || 0;

          if (bet.winningSide && participation.side === bet.winningSide) {
            wonBets++;
            const winAmount = participation.payout || 0;
            totalWinnings += winAmount;
            if (winAmount > largestWin) largestWin = winAmount;
          } else if (bet.winningSide) {
            lostBets++;
            const lossAmount = participation.amount || 0;
            if (lossAmount > largestLoss) largestLoss = lossAmount;
          }
        }
      });

      const cancelledBets = validBets.filter(b => b.status === 'CANCELLED').length;
      const winRate = resolvedBets.length > 0 ? (wonBets / resolvedBets.length) * 100 : 0;
      const netProfit = totalWinnings - totalWagered;
      const averageBetSize = userParticipations.length > 0
        ? totalWagered / userParticipations.length
        : 0;

      // Calculate streaks
      const sortedResolvedBets = resolvedBets.sort((a, b) =>
        new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
      );

      let currentStreak: BetStats['currentStreak'] = { type: 'none', count: 0 };
      let longestWinStreak = 0;
      let longestLossStreak = 0;
      let currentWinStreak = 0;
      let currentLossStreak = 0;

      sortedResolvedBets.forEach((bet, index) => {
        const participation = userParticipations.find(p => p.betId === bet.id);
        if (participation && bet.winningSide) {
          const isWin = participation.side === bet.winningSide;

          if (isWin) {
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak;
          } else {
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > longestLossStreak) longestLossStreak = currentLossStreak;
          }

          if (index === 0) {
            currentStreak = {
              type: isWin ? 'win' : 'loss',
              count: 1
            };
          } else if (currentStreak.type === (isWin ? 'win' : 'loss')) {
            currentStreak.count++;
          }
        }
      });

      setStats({
        totalBets: validBets.length,
        activeBets,
        wonBets,
        lostBets,
        cancelledBets,
        totalWagered,
        totalWinnings,
        netProfit,
        winRate,
        averageBetSize,
        largestWin,
        largestLoss,
        currentStreak,
        longestWinStreak,
        longestLossStreak,
      });
    } catch (error) {
      console.error('Error fetching detailed stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDetailedStats();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchDetailedStats();
  }, [user]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Detailed Stats" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your stats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Detailed Stats" onClose={onClose} />
        <View style={styles.emptyContainer}>
          <Ionicons name="bar-chart-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>No betting data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Detailed Stats" onClose={onClose} />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Overview Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>OVERVIEW</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Total Bets"
              value={stats.totalBets.toString()}
              icon="receipt-outline"
            />
            <StatCard
              label="Active"
              value={stats.activeBets.toString()}
              icon="hourglass-outline"
              color={colors.success}
            />
            <StatCard
              label="Won"
              value={stats.wonBets.toString()}
              icon="trophy-outline"
              color={colors.info}
            />
            <StatCard
              label="Lost"
              value={stats.lostBets.toString()}
              icon="close-circle-outline"
              color={colors.error}
            />
          </View>
        </View>

        {/* Financial Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FINANCIAL</Text>
          <View style={styles.financialCard}>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Total Wagered</Text>
              <Text style={styles.financialValue}>{formatCurrency(stats.totalWagered)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Total Winnings</Text>
              <Text style={[styles.financialValue, { color: colors.success }]}>
                {formatCurrency(stats.totalWinnings)}
              </Text>
            </View>
            <View style={[styles.financialRow, styles.financialRowHighlight]}>
              <Text style={styles.financialLabelBold}>Net Profit/Loss</Text>
              <Text style={[
                styles.financialValueBold,
                { color: stats.netProfit >= 0 ? colors.info : colors.error }
              ]}>
                {stats.netProfit >= 0 ? '+' : ''}{formatCurrency(stats.netProfit)}
              </Text>
            </View>
          </View>
        </View>

        {/* Performance Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PERFORMANCE</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Win Rate"
              value={formatPercentage(stats.winRate)}
              icon="trending-up-outline"
              color={stats.winRate >= 50 ? colors.success : colors.error}
            />
            <StatCard
              label="Avg Bet Size"
              value={formatCurrency(stats.averageBetSize, 'USD', false)}
              icon="cash-outline"
            />
            <StatCard
              label="Largest Win"
              value={formatCurrency(stats.largestWin, 'USD', false)}
              icon="trophy-outline"
              color={colors.info}
            />
            <StatCard
              label="Largest Loss"
              value={formatCurrency(stats.largestLoss, 'USD', false)}
              icon="alert-circle-outline"
              color={colors.error}
            />
          </View>
        </View>

        {/* Streaks Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STREAKS</Text>
          <View style={styles.streakCard}>
            {stats.currentStreak.type !== 'none' && (
              <View style={styles.currentStreakContainer}>
                <Ionicons
                  name={stats.currentStreak.type === 'win' ? 'flame' : 'snow'}
                  size={32}
                  color={stats.currentStreak.type === 'win' ? colors.warning : colors.info}
                />
                <View>
                  <Text style={styles.currentStreakLabel}>Current Streak</Text>
                  <Text style={styles.currentStreakValue}>
                    {stats.currentStreak.count} {stats.currentStreak.type === 'win' ? 'Wins' : 'Losses'}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Longest Win Streak</Text>
              <Text style={[styles.streakValue, { color: colors.success }]}>
                {stats.longestWinStreak} bets
              </Text>
            </View>
            <View style={styles.streakRow}>
              <Text style={styles.streakLabel}>Longest Loss Streak</Text>
              <Text style={[styles.streakValue, { color: colors.error }]}>
                {stats.longestLossStreak} bets
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// Stat Card Component
interface StatCardProps {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color = colors.textPrimary }) => {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={24} color={color} style={styles.statIcon} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...textStyles.h4,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // Section
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs / 2,
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginHorizontal: spacing.xs / 2,
    marginBottom: spacing.sm,
  },
  statIcon: {
    marginBottom: spacing.xs,
  },
  statValue: {
    ...textStyles.h3,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs / 2,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Financial Card
  financialCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  financialRowHighlight: {
    backgroundColor: colors.surfaceLight,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: -spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: spacing.radius.md,
    borderBottomRightRadius: spacing.radius.md,
  },
  financialLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  financialLabelBold: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  financialValue: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  financialValueBold: {
    ...textStyles.h3,
    fontWeight: typography.fontWeight.bold,
  },

  // Streak Card
  streakCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
  },
  currentStreakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  currentStreakLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.md,
  },
  currentStreakValue: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.md,
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  streakLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  streakValue: {
    ...textStyles.button,
    fontWeight: typography.fontWeight.semibold,
  },
});
