/**
 * Balance Audit Trail Screen
 * Complete transaction history showing all balance changes
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { Bet } from '../types/betting';
import { formatCurrency } from '../utils/formatting';
import { bulkLoadUserBetsWithParticipants } from '../services/bulkLoadingService';

const client = generateClient<Schema>();

interface BettingHistoryScreenProps {
  onClose: () => void;
}

type FilterType = 'all' | 'bets_placed' | 'wins' | 'losses' | 'refunds';

interface Transaction {
  id: string;
  date: string;
  type: 'BET_PLACED' | 'BET_WON' | 'BET_LOST' | 'BET_REFUNDED';
  description: string;
  betTitle: string;
  amount: number; // Positive for credits, negative for debits
  balance?: number; // Running balance after transaction
  betId: string;
  userSide?: string;
}

export const BettingHistoryScreen: React.FC<BettingHistoryScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [currentBalance, setCurrentBalance] = useState(0);

  const fetchBettingHistory = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Fetch user data for current balance
      const { data: userData } = await client.models.User.get({ id: user.userId });
      setCurrentBalance(userData?.balance || 0);

      // Fetch user's bets with participants
      const userBets = await bulkLoadUserBetsWithParticipants(user.userId);

      // Convert bets to transactions
      const allTransactions: Transaction[] = [];

      userBets.forEach(bet => {
        const userParticipation = bet.participants?.find(p => p.userId === user.userId);
        if (!userParticipation) return;

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

        const betOdds = parseBetOdds(bet.odds);
        const userSideName = userParticipation.side === 'A' ? betOdds.sideAName : betOdds.sideBName;

        // Transaction 1: Bet Placed (debit)
        allTransactions.push({
          id: `${bet.id}-placed`,
          date: userParticipation.joinedAt,
          type: 'BET_PLACED',
          description: `Bet placed on ${userSideName}`,
          betTitle: bet.title,
          amount: -userParticipation.amount,
          betId: bet.id,
          userSide: userSideName,
        });

        // Transaction 2: Outcome (if resolved)
        if (bet.status === 'RESOLVED' && bet.winningSide) {
          const won = userParticipation.side === bet.winningSide;
          if (won && userParticipation.payout) {
            allTransactions.push({
              id: `${bet.id}-won`,
              date: bet.updatedAt,
              type: 'BET_WON',
              description: `Won bet on ${userSideName}`,
              betTitle: bet.title,
              amount: userParticipation.payout,
              betId: bet.id,
              userSide: userSideName,
            });
          } else {
            allTransactions.push({
              id: `${bet.id}-lost`,
              date: bet.updatedAt,
              type: 'BET_LOST',
              description: `Lost bet on ${userSideName}`,
              betTitle: bet.title,
              amount: 0, // No money back on loss
              betId: bet.id,
              userSide: userSideName,
            });
          }
        } else if (bet.status === 'CANCELLED') {
          // Transaction 2: Refund (if cancelled)
          allTransactions.push({
            id: `${bet.id}-refunded`,
            date: bet.updatedAt,
            type: 'BET_REFUNDED',
            description: `Bet cancelled - refund issued`,
            betTitle: bet.title,
            amount: userParticipation.amount,
            betId: bet.id,
            userSide: userSideName,
          });
        }
      });

      // Sort by date, newest first
      allTransactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching betting history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBettingHistory();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchBettingHistory();
  }, [user]);

  const filteredTransactions = transactions.filter(transaction => {
    if (filter === 'all') return true;
    if (filter === 'bets_placed') return transaction.type === 'BET_PLACED';
    if (filter === 'wins') return transaction.type === 'BET_WON';
    if (filter === 'losses') return transaction.type === 'BET_LOST';
    if (filter === 'refunds') return transaction.type === 'BET_REFUNDED';
    return true;
  });

  const renderFilterButton = (type: FilterType, label: string, icon: keyof typeof Ionicons.glyphMap) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === type && styles.filterButtonActive]}
      onPress={() => setFilter(type)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={16}
        color={filter === type ? colors.background : colors.textSecondary}
      />
      <Text style={[styles.filterButtonText, filter === type && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Balance Audit Trail" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Balance Audit Trail" onClose={onClose} />

      {/* Current Balance Summary */}
      <View style={styles.balanceSummary}>
        <Text style={styles.balanceSummaryLabel}>Current Balance</Text>
        <Text style={styles.balanceSummaryAmount}>{formatCurrency(currentBalance)}</Text>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {renderFilterButton('all', 'All', 'list-outline')}
        {renderFilterButton('bets_placed', 'Bets', 'arrow-down-outline')}
        {renderFilterButton('wins', 'Wins', 'arrow-up-outline')}
        {renderFilterButton('losses', 'Losses', 'close-circle-outline')}
        {renderFilterButton('refunds', 'Refunds', 'refresh-outline')}
      </View>

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
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No transaction history' : `No ${filter.replace('_', ' ')} transactions`}
            </Text>
          </View>
        ) : (
          filteredTransactions.map((transaction) => (
            <TransactionCard key={transaction.id} transaction={transaction} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// Transaction Card Component
interface TransactionCardProps {
  transaction: Transaction;
}

const TransactionCard: React.FC<TransactionCardProps> = ({ transaction }) => {
  const getTransactionIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (transaction.type) {
      case 'BET_PLACED': return 'arrow-down';
      case 'BET_WON': return 'arrow-up';
      case 'BET_LOST': return 'close-circle';
      case 'BET_REFUNDED': return 'refresh';
    }
  };

  const getTransactionColor = () => {
    switch (transaction.type) {
      case 'BET_PLACED': return colors.error; // Red for money out
      case 'BET_WON': return colors.success; // Green for money in
      case 'BET_LOST': return colors.textMuted; // Gray for loss (no money movement)
      case 'BET_REFUNDED': return colors.warning; // Yellow for refund
    }
  };

  const getTransactionLabel = () => {
    switch (transaction.type) {
      case 'BET_PLACED': return 'Bet Placed';
      case 'BET_WON': return 'Bet Won';
      case 'BET_LOST': return 'Bet Lost';
      case 'BET_REFUNDED': return 'Refunded';
    }
  };

  const formatAmount = () => {
    if (transaction.amount === 0) return '-';
    const sign = transaction.amount > 0 ? '+' : '';
    return `${sign}${formatCurrency(Math.abs(transaction.amount))}`;
  };

  const isCredit = transaction.amount > 0;
  const isDebit = transaction.amount < 0;

  return (
    <View style={styles.transactionCard}>
      <View style={styles.transactionHeader}>
        <View style={[styles.transactionIconContainer, { backgroundColor: getTransactionColor() + '20' }]}>
          <Ionicons name={getTransactionIcon()} size={20} color={getTransactionColor()} />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.transactionType}>{getTransactionLabel()}</Text>
          <Text style={styles.transactionBetTitle} numberOfLines={1}>
            {transaction.betTitle}
          </Text>
          <Text style={styles.transactionDescription} numberOfLines={1}>
            {transaction.description}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text style={[
            styles.transactionAmount,
            isCredit && styles.transactionAmountCredit,
            isDebit && styles.transactionAmountDebit,
          ]}>
            {formatAmount()}
          </Text>
          <Text style={styles.transactionDate}>
            {new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
      </View>
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
    paddingTop: spacing.xl * 2,
  },
  emptyText: {
    ...textStyles.h4,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // Balance Summary
  balanceSummary: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  balanceSummaryLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: spacing.xs / 2,
  },
  balanceSummaryAmount: {
    ...textStyles.h2,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },

  // Filters
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs / 2,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
  },
  filterButtonTextActive: {
    color: colors.background,
  },

  // Transaction Card
  transactionCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs / 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  transactionInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  transactionType: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 2,
  },
  transactionBetTitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  transactionDescription: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  transactionAmountCredit: {
    color: colors.success,
  },
  transactionAmountDebit: {
    color: colors.error,
  },
  transactionDate: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
});
