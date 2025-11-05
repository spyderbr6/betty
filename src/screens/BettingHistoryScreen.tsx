/**
 * Balance Audit Trail Screen
 * Complete transaction history showing all balance changes (payments + bets)
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
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';
import type { Transaction, TransactionType } from '../services/transactionService';

interface BettingHistoryScreenProps {
  onClose: () => void;
}

type FilterType = 'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'BETS' | 'WINNINGS' | 'REFUNDS';

export const BettingHistoryScreen: React.FC<BettingHistoryScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [currentBalance, setCurrentBalance] = useState(0);

  const fetchTransactions = async () => {
    if (!user?.userId) return;

    try {
      setIsLoading(true);

      // Fetch balance and transactions in parallel
      const [balance, txns] = await Promise.all([
        TransactionService.getUserBalance(user.userId),
        TransactionService.getUserTransactions(user.userId, { limit: 100 }),
      ]);

      setCurrentBalance(balance);
      setTransactions(txns);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, [user?.userId]);

  useEffect(() => {
    applyFilter();
  }, [filter, transactions]);

  const applyFilter = () => {
    if (filter === 'ALL') {
      setFilteredTransactions(transactions);
    } else {
      const typeMap: Record<FilterType, TransactionType[]> = {
        ALL: [],
        DEPOSITS: ['DEPOSIT'],
        WITHDRAWALS: ['WITHDRAWAL'],
        BETS: ['BET_PLACED'],
        WINNINGS: ['BET_WON'],
        REFUNDS: ['BET_CANCELLED', 'BET_REFUND'],
      };

      const types = typeMap[filter] || [];
      setFilteredTransactions(transactions.filter(t => types.includes(t.type)));
    }
  };

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
        <Text style={styles.balanceSummarySubtext}>{transactions.length} total transactions</Text>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersContainer}>
        <View style={styles.filtersContent}>
          {renderFilterButton('ALL', 'All', 'list-outline')}
          {renderFilterButton('DEPOSITS', 'Deposits', 'arrow-down-circle-outline')}
          {renderFilterButton('WITHDRAWALS', 'Withdrawals', 'arrow-up-circle-outline')}
          {renderFilterButton('BETS', 'Bets', 'game-controller-outline')}
          {renderFilterButton('WINNINGS', 'Wins', 'trophy-outline')}
          {renderFilterButton('REFUNDS', 'Refunds', 'refresh-outline')}
        </View>
      </ScrollView>

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
              {filter === 'ALL' ? 'No transaction history' : `No ${filter.toLowerCase()} transactions`}
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
      case 'DEPOSIT': return 'arrow-down-circle';
      case 'WITHDRAWAL': return 'arrow-up-circle';
      case 'BET_PLACED': return 'game-controller';
      case 'BET_WON': return 'trophy';
      case 'BET_CANCELLED':
      case 'BET_REFUND': return 'refresh-circle';
      case 'ADMIN_ADJUSTMENT': return 'settings';
      default: return 'swap-horizontal';
    }
  };

  const getTransactionColor = () => {
    if (transaction.status === 'FAILED') return colors.error;
    if (transaction.status === 'PENDING') return colors.warning;

    switch (transaction.type) {
      case 'DEPOSIT':
      case 'BET_WON':
      case 'BET_CANCELLED':
      case 'BET_REFUND':
        return colors.success;
      case 'WITHDRAWAL':
      case 'BET_PLACED':
        return colors.error;
      case 'ADMIN_ADJUSTMENT':
        return colors.info;
      default:
        return colors.textSecondary;
    }
  };

  const getTransactionLabel = () => {
    switch (transaction.type) {
      case 'DEPOSIT': return 'Deposit';
      case 'WITHDRAWAL': return 'Withdrawal';
      case 'BET_PLACED': return 'Bet Placed';
      case 'BET_WON': return 'Bet Won';
      case 'BET_CANCELLED': return 'Bet Cancelled';
      case 'BET_REFUND': return 'Refund';
      case 'ADMIN_ADJUSTMENT': return 'Adjustment';
      default: return 'Transaction';
    }
  };

  const getTransactionDescription = () => {
    if (transaction.notes) return transaction.notes;

    switch (transaction.type) {
      case 'DEPOSIT':
        return transaction.venmoUsername
          ? `From Venmo ${transaction.venmoUsername}`
          : 'Deposit to account';
      case 'WITHDRAWAL':
        return transaction.venmoUsername
          ? `To Venmo ${transaction.venmoUsername}`
          : 'Withdrawal from account';
      case 'BET_PLACED':
        return 'Joined a bet';
      case 'BET_WON':
        return 'Winnings payout';
      case 'BET_CANCELLED':
        return 'Bet cancelled - refund';
      case 'BET_REFUND':
        return 'Manual refund';
      case 'ADMIN_ADJUSTMENT':
        return 'Balance adjustment';
      default:
        return 'Transaction';
    }
  };

  const getStatusBadge = () => {
    if (transaction.status === 'COMPLETED') return null;

    let statusColor: string = colors.textMuted;
    let statusText: string = transaction.status;

    switch (transaction.status) {
      case 'PENDING':
        statusColor = colors.warning;
        statusText = 'PENDING';
        break;
      case 'PROCESSING':
        statusColor = colors.info;
        statusText = 'PROCESSING';
        break;
      case 'FAILED':
        statusColor = colors.error;
        statusText = 'FAILED';
        break;
      case 'CANCELLED':
        statusColor = colors.textMuted;
        statusText = 'CANCELLED';
        break;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>
    );
  };

  const formatAmount = () => {
    const isCredit = transaction.type === 'DEPOSIT' ||
                     transaction.type === 'BET_WON' ||
                     transaction.type === 'BET_CANCELLED' ||
                     transaction.type === 'BET_REFUND';

    const sign = isCredit ? '+' : '-';
    return `${sign}${formatCurrency(transaction.amount)}`;
  };

  const formatDate = () => {
    const date = new Date(transaction.createdAt);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const isCredit = transaction.type === 'DEPOSIT' ||
                   transaction.type === 'BET_WON' ||
                   transaction.type === 'BET_CANCELLED' ||
                   transaction.type === 'BET_REFUND';

  return (
    <View style={[styles.transactionCard, { borderLeftColor: getTransactionColor() }]}>
      <View style={styles.transactionHeader}>
        <View style={[styles.transactionIconContainer, { backgroundColor: getTransactionColor() + '20' }]}>
          <Ionicons name={getTransactionIcon()} size={20} color={getTransactionColor()} />
        </View>
        <View style={styles.transactionInfo}>
          <View style={styles.transactionTitleRow}>
            <Text style={styles.transactionType}>{getTransactionLabel()}</Text>
            {getStatusBadge()}
          </View>
          <Text style={styles.transactionDescription} numberOfLines={2}>
            {getTransactionDescription()}
          </Text>
          <View style={styles.transactionMeta}>
            <Text style={styles.transactionDate}>{formatDate()}</Text>
            {transaction.venmoTransactionId && (
              <Text style={styles.transactionId}>
                ID: {transaction.venmoTransactionId.substring(0, 8)}...
              </Text>
            )}
          </View>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text style={[
            styles.transactionAmount,
            isCredit ? styles.transactionAmountCredit : styles.transactionAmountDebit,
          ]}>
            {formatAmount()}
          </Text>
          <Text style={styles.transactionBalance}>
            Bal: {formatCurrency(transaction.balanceAfter)}
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
    textAlign: 'center',
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
  balanceSummarySubtext: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: spacing.xs / 2,
  },

  // Filters
  filtersContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    maxHeight: 50,
  },
  filtersContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
    height: 32,
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
    fontWeight: typography.fontWeight.semibold,
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
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  transactionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    marginTop: 2,
  },
  transactionInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  transactionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  transactionType: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
  },
  statusText: {
    ...textStyles.caption,
    fontWeight: typography.fontWeight.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  transactionDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.xs / 2,
    lineHeight: 16,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transactionDate: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  transactionId: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: spacing.xs,
    fontFamily: typography.fontFamily.mono,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    ...textStyles.button,
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
  transactionBalance: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
});
