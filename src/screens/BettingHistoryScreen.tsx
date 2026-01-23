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
  navigation?: any; // Navigation prop for deep linking to bet/squares details
}

type FilterType = 'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'BETS' | 'WINNINGS' | 'LOSSES' | 'REFUNDS';

export const BettingHistoryScreen: React.FC<BettingHistoryScreenProps> = ({ onClose, navigation }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [currentBalance, setCurrentBalance] = useState(0);

  // Handler for navigating to bet/squares details
  const handleTransactionPress = (transaction: Transaction) => {
    if (!navigation) return;

    // Navigate to squares game detail if it's a squares transaction
    if (transaction.relatedSquaresGameId) {
      // Navigate first, then close modal with delay to ensure navigation completes
      navigation.navigate('Bets', {
        screen: 'SquaresGameDetail',
        params: { gameId: transaction.relatedSquaresGameId }
      });
      // Close modal after a brief delay to let navigation start
      setTimeout(() => onClose(), 100);
      return;
    }

    // Note: Regular bets (relatedBetId) don't have a detail screen yet,
    // so we don't navigate for those transactions
  };

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
        BETS: ['BET_PLACED', 'SQUARES_PURCHASE'],
        WINNINGS: ['BET_WON', 'SQUARES_PAYOUT'],
        LOSSES: ['BET_LOST'],
        REFUNDS: ['BET_CANCELLED', 'BET_REFUND', 'SQUARES_REFUND'],
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
          {renderFilterButton('LOSSES', 'Losses', 'close-circle-outline')}
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
            <TransactionCard
              key={transaction.id}
              transaction={transaction}
              onPress={handleTransactionPress}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// Transaction Card Component
interface TransactionCardProps {
  transaction: Transaction;
  onPress: (transaction: Transaction) => void;
}

const TransactionCard: React.FC<TransactionCardProps> = ({ transaction, onPress }) => {
  // Check if transaction is clickable (only squares games have detail pages)
  const isClickable = !!transaction.relatedSquaresGameId;
  const getTransactionIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (transaction.type) {
      case 'DEPOSIT': return 'arrow-down-circle';
      case 'WITHDRAWAL': return 'arrow-up-circle';
      case 'BET_PLACED': return 'game-controller';
      case 'BET_WON': return 'trophy';
      case 'BET_LOST': return 'close-circle';
      case 'BET_CANCELLED':
      case 'BET_REFUND': return 'refresh-circle';
      case 'SQUARES_PURCHASE': return 'grid';
      case 'SQUARES_PAYOUT': return 'trophy';
      case 'SQUARES_REFUND': return 'refresh-circle';
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
      case 'SQUARES_PAYOUT':
      case 'SQUARES_REFUND':
        return colors.success;
      case 'WITHDRAWAL':
      case 'BET_PLACED':
      case 'SQUARES_PURCHASE':
        return colors.error;
      case 'BET_LOST':
        return colors.textMuted; // Neutral color for lost bets (no balance change)
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
      case 'BET_LOST': return 'Bet Lost';
      case 'BET_CANCELLED': return 'Bet Cancelled';
      case 'BET_REFUND': return 'Refund';
      case 'SQUARES_PURCHASE': return 'Squares Purchased';
      case 'SQUARES_PAYOUT': return 'Squares Won';
      case 'SQUARES_REFUND': return 'Squares Refund';
      case 'ADMIN_ADJUSTMENT': return 'Adjustment';
      default: return 'Transaction';
    }
  };

  const getTransactionDescription = () => {
    // If notes field has content, use it (contains bet title or specific description)
    if (transaction.notes && transaction.notes.trim()) {
      // For bet transactions, notes contains the bet title or description
      return transaction.notes;
    }

    // Fallback descriptions if notes is empty
    switch (transaction.type) {
      case 'DEPOSIT': {
        const baseName = transaction.venmoUsername
          ? `From Venmo @${transaction.venmoUsername}`
          : 'Deposit to account';

        // Show fee if actualAmount differs from requested amount
        if (transaction.actualAmount !== undefined && transaction.actualAmount < transaction.amount) {
          const fee = transaction.amount - transaction.actualAmount;
          return `${baseName} (Fee: ${formatCurrency(fee)})`;
        }
        return baseName;
      }
      case 'WITHDRAWAL': {
        const baseName = transaction.venmoUsername
          ? `To Venmo @${transaction.venmoUsername}`
          : 'Withdrawal from account';

        // Show platform fee (2%) and Venmo fee if present
        let feeInfo = '';
        if (transaction.platformFee && transaction.platformFee > 0) {
          feeInfo = `Platform fee: ${formatCurrency(transaction.platformFee)}`;
        }
        if (transaction.actualAmount !== undefined && transaction.actualAmount < transaction.amount) {
          const venmoFee = transaction.amount - transaction.actualAmount - (transaction.platformFee || 0);
          if (venmoFee > 0) {
            feeInfo += feeInfo ? `, Venmo fee: ${formatCurrency(venmoFee)}` : `Venmo fee: ${formatCurrency(venmoFee)}`;
          }
        }

        return feeInfo ? `${baseName} (${feeInfo})` : baseName;
      }
      case 'BET_PLACED':
        // Show bet ID as fallback if no title in notes
        return transaction.relatedBetId
          ? `Bet ID: ${transaction.relatedBetId.substring(0, 8)}...`
          : 'Joined a bet';
      case 'BET_WON': {
        // Show bet ID and platform fee if present
        let description = transaction.relatedBetId
          ? `Bet ID: ${transaction.relatedBetId.substring(0, 8)}...`
          : 'Winnings payout';

        if (transaction.platformFee && transaction.platformFee > 0) {
          description += ` (Fee: ${formatCurrency(transaction.platformFee)})`;
        }
        return description;
      }
      case 'BET_LOST':
        return transaction.relatedBetId
          ? `Bet ID: ${transaction.relatedBetId.substring(0, 8)}...`
          : 'Lost bet - tracking record';
      case 'BET_CANCELLED':
        return transaction.relatedBetId
          ? `Bet ID: ${transaction.relatedBetId.substring(0, 8)}... - Refunded`
          : 'Bet cancelled - refund';
      case 'BET_REFUND':
        return 'Manual refund';
      case 'ADMIN_ADJUSTMENT':
        return 'Balance adjustment by admin';
      case 'SQUARES_PURCHASE':
        return transaction.relatedSquaresGameId
          ? `Squares ID: ${transaction.relatedSquaresGameId.substring(0, 8)}...`
          : 'Purchased squares';
      case 'SQUARES_PAYOUT':
        return transaction.relatedSquaresGameId
          ? `Squares ID: ${transaction.relatedSquaresGameId.substring(0, 8)}...`
          : 'Squares period winner';
      case 'SQUARES_REFUND':
        return 'Squares game cancelled - refund';
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
    // BET_LOST is a zero-amount tracking transaction
    if (transaction.type === 'BET_LOST') {
      return formatCurrency(0);
    }

    const isCredit = transaction.type === 'DEPOSIT' ||
                     transaction.type === 'BET_WON' ||
                     transaction.type === 'BET_CANCELLED' ||
                     transaction.type === 'BET_REFUND' ||
                     transaction.type === 'SQUARES_PAYOUT' ||
                     transaction.type === 'SQUARES_REFUND';

    let displayAmount = transaction.amount;

    // For transactions with actualAmount, use it (net amount after fees)
    // This includes: DEPOSIT (after Venmo fees), WITHDRAWAL (after all fees), BET_WON (after platform fee)
    if (transaction.actualAmount !== undefined) {
      displayAmount = transaction.actualAmount;
    }

    const sign = isCredit ? '+' : '-';
    return `${sign}${formatCurrency(displayAmount)}`;
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
                   transaction.type === 'BET_REFUND' ||
                   transaction.type === 'SQUARES_PAYOUT' ||
                   transaction.type === 'SQUARES_REFUND';

  // BET_LOST is neutral (no balance change)
  const isNeutral = transaction.type === 'BET_LOST';

  const cardContent = (
    <>
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
            isNeutral ? styles.transactionAmountNeutral : (isCredit ? styles.transactionAmountCredit : styles.transactionAmountDebit),
          ]}>
            {formatAmount()}
          </Text>
          <Text style={styles.transactionBalance}>
            Bal: {formatCurrency(transaction.balanceAfter)}
          </Text>
          {isClickable && (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textMuted}
              style={{ marginTop: spacing.xs / 2 }}
            />
          )}
        </View>
      </View>
    </>
  );

  if (isClickable) {
    return (
      <TouchableOpacity
        style={[styles.transactionCard, { borderLeftColor: getTransactionColor() }]}
        onPress={() => onPress(transaction)}
        activeOpacity={0.7}
      >
        {cardContent}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.transactionCard, { borderLeftColor: getTransactionColor() }]}>
      {cardContent}
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
  transactionAmountNeutral: {
    color: colors.textMuted,
  },
  transactionBalance: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
});
