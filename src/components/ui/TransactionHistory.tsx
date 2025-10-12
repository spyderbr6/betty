/**
 * Transaction History Component
 * Displays user's transaction history with filtering and sorting
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, textStyles } from '../../styles';
import { TransactionService } from '../../services/transactionService';
import type { Transaction, TransactionType, TransactionStatus } from '../../services/transactionService';
import { formatCurrency } from '../../utils/formatting';

interface TransactionHistoryProps {
  userId: string;
  limit?: number;
  onTransactionPress?: (transaction: Transaction) => void;
}

type FilterType = 'ALL' | TransactionType;

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  userId,
  limit = 50,
  onTransactionPress,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('ALL');

  useEffect(() => {
    loadTransactions();
  }, [userId]);

  useEffect(() => {
    applyFilter();
  }, [filter, transactions]);

  const loadTransactions = async () => {
    try {
      setIsLoading(true);
      const data = await TransactionService.getUserTransactions(userId, { limit });
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilter = () => {
    if (filter === 'ALL') {
      setFilteredTransactions(transactions);
    } else {
      setFilteredTransactions(transactions.filter(t => t.type === filter));
    }
  };

  const getTransactionIcon = (type: TransactionType, status: TransactionStatus): string => {
    if (status === 'FAILED') return 'close-circle';
    if (status === 'PENDING') return 'time';

    switch (type) {
      case 'DEPOSIT':
        return 'arrow-down-circle';
      case 'WITHDRAWAL':
        return 'arrow-up-circle';
      case 'BET_PLACED':
        return 'game-controller';
      case 'BET_WON':
        return 'trophy';
      case 'BET_CANCELLED':
      case 'BET_REFUND':
        return 'refresh-circle';
      case 'ADMIN_ADJUSTMENT':
        return 'settings';
      default:
        return 'swap-horizontal';
    }
  };

  const getTransactionColor = (type: TransactionType, status: TransactionStatus): string => {
    if (status === 'FAILED') return colors.error;
    if (status === 'PENDING') return colors.warning;

    switch (type) {
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

  const getTransactionTitle = (transaction: Transaction): string => {
    switch (transaction.type) {
      case 'DEPOSIT':
        return 'Deposit';
      case 'WITHDRAWAL':
        return 'Withdrawal';
      case 'BET_PLACED':
        return 'Bet Placed';
      case 'BET_WON':
        return 'Bet Won';
      case 'BET_CANCELLED':
        return 'Bet Cancelled';
      case 'BET_REFUND':
        return 'Bet Refund';
      case 'ADMIN_ADJUSTMENT':
        return 'Balance Adjustment';
      default:
        return 'Transaction';
    }
  };

  const getTransactionDescription = (transaction: Transaction): string => {
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

  const getStatusBadge = (status: TransactionStatus) => {
    let statusColor = colors.textMuted;
    let statusText = status;

    switch (status) {
      case 'COMPLETED':
        statusColor = colors.success;
        statusText = 'Completed';
        break;
      case 'PENDING':
        statusColor = colors.warning;
        statusText = 'Pending';
        break;
      case 'PROCESSING':
        statusColor = colors.info;
        statusText = 'Processing';
        break;
      case 'FAILED':
        statusColor = colors.error;
        statusText = 'Failed';
        break;
      case 'CANCELLED':
        statusColor = colors.textMuted;
        statusText = 'Cancelled';
        break;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isCredit = (type: TransactionType): boolean => {
    return type === 'DEPOSIT' || type === 'BET_WON' || type === 'BET_CANCELLED' || type === 'BET_REFUND';
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const icon = getTransactionIcon(item.type, item.status);
    const color = getTransactionColor(item.type, item.status);
    const title = getTransactionTitle(item);
    const description = getTransactionDescription(item);
    const credit = isCredit(item.type);
    const showStatus = item.status !== 'COMPLETED';

    return (
      <TouchableOpacity
        style={styles.transactionCard}
        onPress={() => onTransactionPress?.(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.transactionIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={24} color={color} />
        </View>

        <View style={styles.transactionInfo}>
          <View style={styles.transactionHeader}>
            <Text style={styles.transactionTitle}>{title}</Text>
            {showStatus && getStatusBadge(item.status)}
          </View>
          <Text style={styles.transactionDescription} numberOfLines={1}>
            {description}
          </Text>
          <Text style={styles.transactionDate}>{formatDate(item.createdAt)}</Text>
        </View>

        <View style={styles.transactionAmount}>
          <Text style={[styles.amountText, { color: credit ? colors.success : colors.error }]}>
            {credit ? '+' : '-'}{formatCurrency(item.amount)}
          </Text>
          <Text style={styles.balanceText}>
            Bal: {formatCurrency(item.balanceAfter)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No Transactions</Text>
      <Text style={styles.emptyDescription}>
        {filter === 'ALL'
          ? 'Your transaction history will appear here'
          : `No ${filter.toLowerCase().replace('_', ' ')} transactions found`}
      </Text>
    </View>
  );

  const renderFilterButton = (filterType: FilterType, label: string) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === filterType && styles.filterButtonActive]}
      onPress={() => setFilter(filterType)}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterButtonText, filter === filterType && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
          {renderFilterButton('ALL', 'All')}
          {renderFilterButton('DEPOSIT', 'Deposits')}
          {renderFilterButton('WITHDRAWAL', 'Withdrawals')}
          {renderFilterButton('BET_PLACED', 'Bets')}
          {renderFilterButton('BET_WON', 'Winnings')}
        </ScrollView>
      </View>

      {/* Transaction List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredTransactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={filteredTransactions.length === 0 ? styles.emptyListContent : undefined}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Filters
  filtersContainer: {
    marginBottom: spacing.md,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
  },
  filterButtonTextActive: {
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },

  // Transaction Card
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  transactionInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  transactionTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  transactionDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  transactionDate: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    ...textStyles.button,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  balanceText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
  },

  // Status Badge
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

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },

  // Empty State
  emptyListContent: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
