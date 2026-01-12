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
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';
import type { Transaction } from '../services/transactionService';
import { SquaresGameService } from '../services/squaresGameService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { showAlert } from '../components/ui/CustomAlert';
import { formatDateTime } from '../utils/formatting';

const client = generateClient<Schema>();

interface AdminDashboardScreenProps {
  onClose: () => void;
}

interface UserDetails {
  displayName?: string;
  username: string;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [squaresGames, setSquaresGames] = useState<any[]>([]);
  const [userDetails, setUserDetails] = useState<Map<string, UserDetails>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [section, setSection] = useState<'TRANSACTIONS' | 'SQUARES'>('TRANSACTIONS');
  const [filter, setFilter] = useState<'ALL' | 'DEPOSITS' | 'WITHDRAWALS'>('ALL');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTransaction, setRejectTransaction] = useState<Transaction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [approvalTransaction, setApprovalTransaction] = useState<Transaction | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [actualAmountReceived, setActualAmountReceived] = useState('');
  const [cancelGameModalVisible, setCancelGameModalVisible] = useState(false);
  const [gameToCancel, setGameToCancel] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Check admin role on mount
  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      showAlert(
        'Access Denied',
        'You do not have permission to access the admin dashboard.',
        [{ text: 'OK', onPress: onClose }]
      );
      return;
    }
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadPendingTransactions(), loadSquaresGames()]);
  };

  const loadPendingTransactions = async () => {
    try {
      setIsLoading(true);
      console.log('[AdminDashboard] Loading pending transactions...');
      const transactions = await TransactionService.getPendingTransactions();
      console.log('[AdminDashboard] Loaded transactions:', transactions.length);
      setPendingTransactions(transactions);

      // Fetch user details for all unique user IDs
      const uniqueUserIds = [...new Set(transactions.map(t => t.userId))];
      console.log('[AdminDashboard] Fetching details for', uniqueUserIds.length, 'users...');

      const userDetailsMap = new Map<string, UserDetails>();
      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const { data: userData } = await client.models.User.get({ id: userId });
            if (userData) {
              userDetailsMap.set(userId, {
                displayName: userData.displayName || undefined,
                username: userData.username || 'Unknown User'
              });
            }
          } catch (error) {
            console.error('[AdminDashboard] Error fetching user details for', userId, error);
            userDetailsMap.set(userId, { username: 'Unknown User' });
          }
        })
      );

      setUserDetails(userDetailsMap);
      console.log('[AdminDashboard] User details loaded for', userDetailsMap.size, 'users');
    } catch (error) {
      console.error('[AdminDashboard] Error loading pending transactions:', error);
      showAlert('Error', 'Failed to load pending transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSquaresGames = async () => {
    try {
      console.log('[AdminDashboard] Loading squares games...');

      // Load all active and locked squares games
      const { data: activeGames } = await client.models.SquaresGame.list({
        filter: {
          or: [
            { status: { eq: 'ACTIVE' } },
            { status: { eq: 'LOCKED' } },
            { status: { eq: 'LIVE' } },
          ]
        }
      });

      if (activeGames) {
        // Sort by creation date (newest first)
        const sortedGames = activeGames.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setSquaresGames(sortedGames);
        console.log('[AdminDashboard] Loaded', sortedGames.length, 'squares games');
      }
    } catch (error) {
      console.error('[AdminDashboard] Error loading squares games:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleApprove = (transaction: Transaction) => {
    setApprovalTransaction(transaction);
    setVerificationCode('');
    setActualAmountReceived(transaction.amount.toFixed(2)); // Pre-fill with requested amount
    setApprovalModalVisible(true);
  };

  const getVerificationId = (transaction: Transaction): string => {
    // For deposits, use Venmo transaction ID
    // For withdrawals, use transaction ID
    if (transaction.type === 'DEPOSIT' && transaction.venmoTransactionId) {
      return transaction.venmoTransactionId;
    }
    return transaction.id;
  };

  const getVerificationLabel = (transaction: Transaction): string => {
    if (transaction.type === 'DEPOSIT' && transaction.venmoTransactionId) {
      return 'Venmo Transaction ID';
    }
    return 'Transaction ID';
  };

  const getUserDisplayName = (userId: string): string => {
    const details = userDetails.get(userId);
    if (!details) {
      // Fallback to truncated ID if user details not loaded yet
      return userId.substring(0, 12) + '...';
    }
    // Priority: displayName > username
    return details.displayName || details.username;
  };

  const handleConfirmApprove = async () => {
    if (!user?.userId || !approvalTransaction) return;

    // Validate verification code
    const verificationId = getVerificationId(approvalTransaction);
    const last4 = verificationId.slice(-4).toLowerCase();

    if (verificationCode.toLowerCase() !== last4) {
      showAlert(
        'Verification Failed',
        `The code you entered does not match the last 4 digits of the ${getVerificationLabel(approvalTransaction).toLowerCase()}.`
      );
      return;
    }

    // Validate actual amount received
    const actualAmount = parseFloat(actualAmountReceived);
    if (isNaN(actualAmount) || actualAmount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount received');
      return;
    }

    if (actualAmount > approvalTransaction.amount) {
      showAlert(
        'Amount Too High',
        `The amount received ($${actualAmount.toFixed(2)}) cannot be greater than the requested amount ($${approvalTransaction.amount.toFixed(2)})`
      );
      return;
    }

    try {
      setApprovalModalVisible(false);
      setProcessingId(approvalTransaction.id);

      console.log('[AdminDashboard] Approving transaction:', approvalTransaction.id, 'with actual amount:', actualAmount);
      const success = await TransactionService.updateTransactionStatus(
        approvalTransaction.id,
        'COMPLETED',
        undefined,
        user.userId,
        actualAmount // Pass the actual amount received
      );

      console.log('[AdminDashboard] Approval result:', success);

      if (success) {
        const feeAmount = approvalTransaction.amount - actualAmount;
        const message = feeAmount > 0.01
          ? `Transaction approved. User credited with $${actualAmount.toFixed(2)} (Venmo fee: $${feeAmount.toFixed(2)})`
          : 'Transaction approved successfully';
        showAlert('Success', message);
        console.log('[AdminDashboard] Reloading transactions after approval...');
        await loadPendingTransactions();
      } else {
        showAlert('Error', 'Failed to approve transaction');
      }
    } catch (error) {
      console.error('[AdminDashboard] Error approving transaction:', error);
      showAlert('Error', 'Failed to approve transaction');
    } finally {
      setProcessingId(null);
      setApprovalTransaction(null);
      setVerificationCode('');
      setActualAmountReceived('');
    }
  };

  const handleReject = (transaction: Transaction) => {
    setRejectTransaction(transaction);
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    if (!user?.userId || !rejectTransaction) return;

    if (!rejectReason.trim()) {
      showAlert('Reason Required', 'Please enter a reason for rejecting this transaction');
      return;
    }

    try {
      console.log('[AdminDashboard] Rejecting transaction:', rejectTransaction.id);
      setRejectModalVisible(false);
      setProcessingId(rejectTransaction.id);

      const success = await TransactionService.updateTransactionStatus(
        rejectTransaction.id,
        'FAILED',
        rejectReason.trim(),
        user.userId
      );

      console.log('[AdminDashboard] Rejection result:', success);

      if (success) {
        showAlert('Success', 'Transaction rejected successfully');
        console.log('[AdminDashboard] Reloading transactions after rejection...');
        await loadPendingTransactions();
      } else {
        showAlert('Error', 'Failed to reject transaction');
      }
    } catch (error) {
      console.error('[AdminDashboard] Error rejecting transaction:', error);
      showAlert('Error', 'Failed to reject transaction');
    } finally {
      setProcessingId(null);
      setRejectTransaction(null);
      setRejectReason('');
    }
  };

  const handleCancelGame = (game: any) => {
    setGameToCancel(game);
    setCancelReason('');
    setCancelGameModalVisible(true);
  };

  const handleConfirmCancelGame = async () => {
    if (!user?.userId || !gameToCancel) return;

    if (!cancelReason.trim()) {
      showAlert('Reason Required', 'Please enter a reason for cancelling this game');
      return;
    }

    try {
      console.log('[AdminDashboard] Cancelling game:', gameToCancel.id);
      setCancelGameModalVisible(false);
      setProcessingId(gameToCancel.id);

      await SquaresGameService.cancelSquaresGame(gameToCancel.id, cancelReason.trim());

      showAlert('Success', 'Game cancelled and all participants have been refunded');
      console.log('[AdminDashboard] Reloading games after cancellation...');
      await loadSquaresGames();
    } catch (error) {
      console.error('[AdminDashboard] Error cancelling game:', error);
      showAlert('Error', 'Failed to cancel game');
    } finally {
      setProcessingId(null);
      setGameToCancel(null);
      setCancelReason('');
    }
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
            <Text style={styles.detailLabel}>User:</Text>
            <Text style={styles.detailValue}>{getUserDisplayName(transaction.userId)}</Text>
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

  const renderSquaresGame = (game: any) => {
    const isProcessing = processingId === game.id;

    return (
      <View key={game.id} style={styles.transactionCard}>
        <View style={styles.transactionHeader}>
          <View style={[
            styles.transactionIcon,
            { backgroundColor: colors.primary + '20' }
          ]}>
            <Ionicons
              name="grid"
              size={24}
              color={colors.primary}
            />
          </View>

          <View style={styles.transactionInfo}>
            <Text style={styles.transactionType} numberOfLines={2}>
              {game.title}
            </Text>
            <Text style={styles.transactionAmount}>
              {formatCurrency(game.totalPot)} pot
            </Text>
            <Text style={styles.transactionDate}>
              {formatDateTime(game.createdAt)}
            </Text>
          </View>

          <View style={styles.transactionActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleCancelGame(game)}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="close-circle" size={20} color={colors.background} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.transactionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Status:</Text>
            <Text style={styles.detailValue}>{game.status}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Price/Square:</Text>
            <Text style={styles.detailValue}>{formatCurrency(game.pricePerSquare)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Squares Sold:</Text>
            <Text style={styles.detailValue}>{game.squaresSold}/100</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Creator:</Text>
            <Text style={styles.detailValue}>{getUserDisplayName(game.creatorId)}</Text>
          </View>
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
        <Text style={styles.warningText}>Admin Mode - Management</Text>
      </View>

      {/* Section Switcher */}
      <View style={styles.filtersContainer}>
        <TouchableOpacity
          style={[styles.filterButton, section === 'TRANSACTIONS' && styles.filterButtonActive]}
          onPress={() => setSection('TRANSACTIONS')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, section === 'TRANSACTIONS' && styles.filterButtonTextActive]}>
            Transactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, section === 'SQUARES' && styles.filterButtonActive]}
          onPress={() => setSection('SQUARES')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, section === 'SQUARES' && styles.filterButtonTextActive]}>
            Squares Games
          </Text>
        </TouchableOpacity>
      </View>

      {section === 'TRANSACTIONS' && (
        <>
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
        </>
      )}

      {section === 'SQUARES' && (
        <>
          {/* Stats Summary */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{squaresGames.length}</Text>
              <Text style={styles.statLabel}>Active Games</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {squaresGames.reduce((sum, g) => sum + g.squaresSold, 0)}
              </Text>
              <Text style={styles.statLabel}>Total Squares</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {formatCurrency(squaresGames.reduce((sum, g) => sum + g.totalPot, 0))}
              </Text>
              <Text style={styles.statLabel}>Total Pot</Text>
            </View>
          </View>
        </>
      )}

      {/* Content List */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {section === 'TRANSACTIONS' ? (
          filteredTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={64} color={colors.success} />
              <Text style={styles.emptyTitle}>All Clear!</Text>
              <Text style={styles.emptyDescription}>
                No pending {filter === 'ALL' ? 'transactions' : filter.toLowerCase()} at the moment
              </Text>
            </View>
          ) : (
            filteredTransactions.map(renderTransaction)
          )
        ) : (
          squaresGames.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="grid-outline" size={64} color={colors.primary} />
              <Text style={styles.emptyTitle}>No Active Games</Text>
              <Text style={styles.emptyDescription}>
                No active squares games require admin attention
              </Text>
            </View>
          ) : (
            squaresGames.map(renderSquaresGame)
          )
        )}
      </ScrollView>

      {/* Approval Verification Modal */}
      <Modal
        visible={approvalModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setApprovalModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setApprovalModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.approvalModal}>
                <View style={styles.approvalModalHeader}>
                  <Ionicons name="shield-checkmark" size={32} color={colors.success} />
                  <Text style={styles.approvalModalTitle}>Verify & Approve</Text>
                </View>

                {approvalTransaction && (
                  <>
                    <View style={styles.approvalModalInfo}>
                      <Text style={styles.approvalModalInfoText}>
                        {approvalTransaction.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} of{' '}
                        {formatCurrency(approvalTransaction.amount)}
                      </Text>
                      <Text style={styles.approvalModalInfoSubtext}>
                        User: {getUserDisplayName(approvalTransaction.userId)}
                      </Text>
                      {approvalTransaction.venmoUsername && (
                        <Text style={styles.approvalModalInfoSubtext}>
                          Venmo: {approvalTransaction.venmoUsername}
                        </Text>
                      )}
                    </View>

                    <View style={styles.verificationIdBox}>
                      <Text style={styles.verificationIdLabel}>
                        {getVerificationLabel(approvalTransaction)}:
                      </Text>
                      <Text style={styles.verificationIdText}>
                        {getVerificationId(approvalTransaction)}
                      </Text>
                    </View>
                  </>
                )}

                <Text style={styles.approvalModalLabel}>
                  Actual Amount Received (After Fees)
                </Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    value={actualAmountReceived}
                    onChangeText={setActualAmountReceived}
                    keyboardType="decimal-pad"
                  />
                </View>
                {approvalTransaction && parseFloat(actualAmountReceived) < approvalTransaction.amount && (
                  <Text style={styles.feeWarning}>
                    Venmo Fee: ${(approvalTransaction.amount - parseFloat(actualAmountReceived || '0')).toFixed(2)}
                  </Text>
                )}

                <Text style={styles.approvalModalLabel}>
                  Enter Last 4 Digits to Verify
                </Text>
                <TextInput
                  style={styles.verificationInput}
                  placeholder="Last 4 digits"
                  placeholderTextColor={colors.textMuted}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  maxLength={4}
                  autoCapitalize="characters"
                  autoFocus
                  keyboardType="default"
                />

                <View style={styles.approvalModalActions}>
                  <TouchableOpacity
                    style={styles.approvalModalCancelButton}
                    onPress={() => setApprovalModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.approvalModalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.approvalModalConfirmButton,
                      (verificationCode.length !== 4 || !actualAmountReceived || parseFloat(actualAmountReceived) <= 0) && styles.approvalModalConfirmButtonDisabled
                    ]}
                    onPress={handleConfirmApprove}
                    disabled={verificationCode.length !== 4 || !actualAmountReceived || parseFloat(actualAmountReceived) <= 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkmark" size={20} color={colors.background} />
                    <Text style={styles.approvalModalConfirmText}>Approve Transaction</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        visible={rejectModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setRejectModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.rejectModal}>
                <View style={styles.rejectModalHeader}>
                  <Ionicons name="close-circle" size={32} color={colors.error} />
                  <Text style={styles.rejectModalTitle}>Reject Transaction</Text>
                </View>

                {rejectTransaction && (
                  <View style={styles.rejectModalInfo}>
                    <Text style={styles.rejectModalInfoText}>
                      {rejectTransaction.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} of{' '}
                      {formatCurrency(rejectTransaction.amount)}
                    </Text>
                    <Text style={styles.rejectModalInfoSubtext}>
                      User: {getUserDisplayName(rejectTransaction.userId)}
                    </Text>
                  </View>
                )}

                <Text style={styles.rejectModalLabel}>Reason for Rejection</Text>
                <TextInput
                  style={styles.rejectModalInput}
                  placeholder="Enter reason (e.g., Invalid transaction ID, Payment not received)"
                  placeholderTextColor={colors.textMuted}
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoFocus
                />

                <View style={styles.rejectModalActions}>
                  <TouchableOpacity
                    style={styles.rejectModalCancelButton}
                    onPress={() => setRejectModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rejectModalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rejectModalConfirmButton,
                      !rejectReason.trim() && styles.rejectModalConfirmButtonDisabled
                    ]}
                    onPress={handleConfirmReject}
                    disabled={!rejectReason.trim()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color={colors.background} />
                    <Text style={styles.rejectModalConfirmText}>Reject Transaction</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cancel Game Modal */}
      <Modal
        visible={cancelGameModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCancelGameModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setCancelGameModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.rejectModal}>
                <View style={styles.rejectModalHeader}>
                  <Ionicons name="close-circle" size={32} color={colors.error} />
                  <Text style={styles.rejectModalTitle}>Cancel Squares Game</Text>
                </View>

                {gameToCancel && (
                  <View style={styles.rejectModalInfo}>
                    <Text style={styles.rejectModalInfoText} numberOfLines={2}>
                      {gameToCancel.title}
                    </Text>
                    <Text style={styles.rejectModalInfoSubtext}>
                      Pot: {formatCurrency(gameToCancel.totalPot)} | Squares: {gameToCancel.squaresSold}/100
                    </Text>
                    <Text style={[styles.rejectModalInfoSubtext, { color: colors.warning, marginTop: spacing.xs }]}>
                      This will refund all participants
                    </Text>
                  </View>
                )}

                <Text style={styles.rejectModalLabel}>Reason for Cancellation</Text>
                <TextInput
                  style={styles.rejectModalInput}
                  placeholder="Enter reason (e.g., Event cancelled, Technical issue)"
                  placeholderTextColor={colors.textMuted}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoFocus
                />

                <View style={styles.rejectModalActions}>
                  <TouchableOpacity
                    style={styles.rejectModalCancelButton}
                    onPress={() => setCancelGameModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.rejectModalCancelText}>Keep Game</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rejectModalConfirmButton,
                      !cancelReason.trim() && styles.rejectModalConfirmButtonDisabled
                    ]}
                    onPress={handleConfirmCancelGame}
                    disabled={!cancelReason.trim()}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color={colors.background} />
                    <Text style={styles.rejectModalConfirmText}>Cancel Game</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
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

  // Approval Modal
  approvalModal: {
    backgroundColor: colors.background,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  approvalModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  approvalModalTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  approvalModalInfo: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  approvalModalInfoText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  approvalModalInfoSubtext: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
    marginTop: spacing.xs / 4,
  },
  verificationIdBox: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  verificationIdLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs / 2,
  },
  verificationIdText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    fontWeight: typography.fontWeight.semibold,
  },
  approvalModalLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  currencySymbol: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  amountInput: {
    flex: 1,
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    paddingVertical: spacing.sm,
    marginLeft: spacing.xs,
  },
  feeWarning: {
    ...textStyles.caption,
    color: colors.warning,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  verificationInput: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.success,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    fontSize: typography.fontSize['2xl'],
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: spacing.lg,
  },
  approvalModalActions: {
    flexDirection: 'row',
  },
  approvalModalCancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  approvalModalCancelText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  approvalModalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.success,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  approvalModalConfirmButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  approvalModalConfirmText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },

  // Reject Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  rejectModal: {
    backgroundColor: colors.background,
    borderRadius: spacing.radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  rejectModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  rejectModalTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  rejectModalInfo: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  rejectModalInfoText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.xs / 2,
  },
  rejectModalInfoSubtext: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
  },
  rejectModalLabel: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  rejectModalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    minHeight: 80,
    marginBottom: spacing.lg,
  },
  rejectModalActions: {
    flexDirection: 'row',
  },
  rejectModalCancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectModalCancelText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  rejectModalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  rejectModalConfirmButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  rejectModalConfirmText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
});
