/**
 * Admin Dashboard Screen
 * Manage pending deposits and withdrawals
 * ADMIN ONLY - Add authentication checks in production
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';
import type { Transaction } from '../services/transactionService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

interface AdminDashboardScreenProps {
  onClose: () => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'DEPOSITS' | 'WITHDRAWALS'>('ALL');

  useEffect(() => {
    loadPendingTransactions();
  }, []);

  const loadPendingTransactions = async () => {
    try {
      setIsLoading(true);
      const transactions = await TransactionService.getPendingTransactions();
      setPendingTransactions(transactions);
    } catch (error) {
      console.error('Error loading pending transactions:', error);
      Alert.alert('Error', 'Failed to load pending transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPendingTransactions();
    setRefreshing(false);
  };

  const handleApprove = async (transaction: Transaction) => {
    if (!user?.userId) return;

    Alert.alert(
      'Approve Transaction',
      `Approve ${transaction.type === 'DEPOSIT' ? 'deposit' : 'withdrawal'} of ${formatCurrency(transaction.amount)} for user ${transaction.userId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            setProcessingId(transaction.id);
            const success = await TransactionService.updateTransactionStatus(
              transaction.id,
              'COMPLETED',
              undefined,
              user.userId
            );

            if (success) {
              Alert.alert('Success', 'Transaction approved successfully');
              await loadPendingTransactions();
            } else {
              Alert.alert('Error', 'Failed to approve transaction');
            }
            setProcessingId(null);
          },
        },
      ]
    );
  };

  const handleReject = async (transaction: Transaction) => {
    if (!user?.userId) return;

    Alert.prompt(
      'Reject Transaction',
      'Enter reason for rejection:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reason) => {
            setProcessingId(transaction.id);
            const success = await TransactionService.updateTransactionStatus(
              transaction.id,
              'FAILED',
              reason || 'Rejected by admin',
              user.userId
            );

            if (success) {
              Alert.alert('Success', 'Transaction rejected');
              await loadPendingTransactions();
            } else {
              Alert.alert('Error', 'Failed to reject transaction');
            }
            setProcessingId(null);
          },
        },
      ],
      'plain-text'
    );
  };

  const getFilteredTransactions = () => {
    if (filter === 'ALL') return pendingTransactions;
    if (filter === 'DEPOSITS') return pendingTransactions.filter(t => t.type === 'DEPOSIT');
    if (filter === 'WITHDRAWALS') return pendingTransactions.filter(t => t.type === 'WITHDRAWAL');
    return pendingTransactions;
  };

  const renderTransaction = (transaction: Transaction) => {
    const isDeposit = transaction.type === 'DEPOSIT';
    const isProcessing = processingId === transaction.id;

    return (
      <View key={transaction.id} style={styles.transactionCard}>
        <View style={styles.transactionHeader}>
          <View style={[
            styles.transactionIcon,
            { backgroundColor: isDeposit ? colors.success + '20' : colors.warning + '20' }
          ]}>
            <Ionicons
              name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'}
              size={24}
              color={isDeposit ? colors.success : colors.warning}
            />
          </View>

          <View style={styles.transactionInfo}>
            <Text style={styles.transactionType}>
              {isDeposit ? 'DEPOSIT' : 'WITHDRAWAL'}
            </Text>
            <Text style={styles.transactionAmount}>
              {formatCurrency(transaction.amount)}
            </Text>
            <Text style={styles.transactionDate}>
              {new Date(transaction.createdAt).toLocaleString()}
            </Text>
          </View>

          <View style={styles.transactionActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => handleApprove(transaction)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="checkmark" size={20} color={colors.background} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleReject(transaction)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={colors.background} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.transactionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>User ID:</Text>
            <Text style={styles.detailValue}>{transaction.userId.substring(0, 12)}...</Text>
          </View>

          {transaction.venmoUsername && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Venmo:</Text>
              <Text style={styles.detailValue}>{transaction.venmoUsername}</Text>
            </View>
          )}

          {transaction.venmoTransactionId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Venmo TX ID:</Text>
              <Text style={styles.detailValue}>{transaction.venmoTransactionId}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Balance Before:</Text>
            <Text style={styles.detailValue}>{formatCurrency(transaction.balanceBefore)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Balance After:</Text>
            <Text style={[styles.detailValue, styles.balanceAfter]}>
              {formatCurrency(transaction.balanceAfter)}
            </Text>
          </View>

          {transaction.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.detailLabel}>Notes:</Text>
              <Text style={styles.notesText}>{transaction.notes}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Admin Dashboard" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading pending transactions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const filteredTransactions = getFilteredTransactions();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Admin Dashboard" onClose={onClose} />

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="shield-checkmark" size={20} color={colors.warning} />
        <Text style={styles.warningText}>Admin Mode - Transaction Approval</Text>
      </View>

      {/* Stats Summary */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingTransactions.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {pendingTransactions.filter(t => t.type === 'DEPOSIT').length}
          </Text>
          <Text style={styles.statLabel}>Deposits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {pendingTransactions.filter(t => t.type === 'WITHDRAWAL').length}
          </Text>
          <Text style={styles.statLabel}>Withdrawals</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'ALL' && styles.filterButtonActive]}
          onPress={() => setFilter('ALL')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, filter === 'ALL' && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'DEPOSITS' && styles.filterButtonActive]}
          onPress={() => setFilter('DEPOSITS')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, filter === 'DEPOSITS' && styles.filterButtonTextActive]}>
            Deposits
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'WITHDRAWALS' && styles.filterButtonActive]}
          onPress={() => setFilter('WITHDRAWALS')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, filter === 'WITHDRAWALS' && styles.filterButtonTextActive]}>
            Withdrawals
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transactions List */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color={colors.success} />
            <Text style={styles.emptyTitle}>All Clear!</Text>
            <Text style={styles.emptyDescription}>
              No pending {filter === 'ALL' ? 'transactions' : filter.toLowerCase()} at the moment
            </Text>
          </View>
        ) : (
          filteredTransactions.map(renderTransaction)
        )}
      </ScrollView>
    </SafeAreaView>
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

  // Warning Banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning + '20',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning + '40',
  },
  warningText: {
    ...textStyles.button,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...textStyles.h2,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },

  // Filters
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    marginHorizontal: spacing.xs / 2,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
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
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  transactionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
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
  },
  transactionType: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  transactionAmount: {
    ...textStyles.h3,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: 2,
  },
  transactionDate: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  transactionActions: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  approveButton: {
    backgroundColor: colors.success,
  },
  rejectButton: {
    backgroundColor: colors.error,
  },

  // Transaction Details
  transactionDetails: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  detailValue: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.mono,
  },
  balanceAfter: {
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
  },
  notesSection: {
    marginTop: spacing.xs,
  },
  notesText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
    fontStyle: 'italic',
  },

  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...textStyles.h3,
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
