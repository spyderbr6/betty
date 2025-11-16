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
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

interface AdminDashboardScreenProps {
  onClose: () => void;
}

interface UserDetails {
  displayName?: string;
  username: string;
}

interface TestBet {
  id: string;
  title: string;
  status: string;
  totalPot: number;
  sideAName: string;
  sideBName: string;
  createdAt: string;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [userDetails, setUserDetails] = useState<Map<string, UserDetails>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'TEST_BETS'>('ALL');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTransaction, setRejectTransaction] = useState<Transaction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [approvalTransaction, setApprovalTransaction] = useState<Transaction | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  // Test Bet Management State
  const [testBets, setTestBets] = useState<TestBet[]>([]);
  const [testBetTitle, setTestBetTitle] = useState('');
  const [testBetDescription, setTestBetDescription] = useState('');
  const [testBetAmount, setTestBetAmount] = useState('10');
  const [testBetSideA, setTestBetSideA] = useState('Yes');
  const [testBetSideB, setTestBetSideB] = useState('No');
  const [testBetDeadline, setTestBetDeadline] = useState('60');
  const [isCreatingBet, setIsCreatingBet] = useState(false);
  const [resolvingBetId, setResolvingBetId] = useState<string | null>(null);

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
    loadPendingTransactions();
  }, []);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPendingTransactions();
    setRefreshing(false);
  };

  const handleApprove = (transaction: Transaction) => {
    setApprovalTransaction(transaction);
    setVerificationCode('');
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

    try {
      setApprovalModalVisible(false);
      setProcessingId(approvalTransaction.id);

      console.log('[AdminDashboard] Approving transaction:', approvalTransaction.id);
      const success = await TransactionService.updateTransactionStatus(
        approvalTransaction.id,
        'COMPLETED',
        undefined,
        user.userId
      );

      console.log('[AdminDashboard] Approval result:', success);

      if (success) {
        showAlert('Success', 'Transaction approved successfully');
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

  const getFilteredTransactions = () => {
    if (filter === 'ALL') return pendingTransactions;
    if (filter === 'DEPOSITS') return pendingTransactions.filter(t => t.type === 'DEPOSIT');
    if (filter === 'WITHDRAWALS') return pendingTransactions.filter(t => t.type === 'WITHDRAWAL');
    return pendingTransactions;
  };

  // Load test bets (PENDING_RESOLUTION bets created by admin)
  const loadTestBets = async () => {
    if (!user?.userId) return;

    try {
      console.log('[AdminDashboard] Loading test bets...');
      const { data: betsData } = await client.models.Bet.list({
        filter: {
          and: [
            { creatorId: { eq: user.userId } },
            { status: { eq: 'PENDING_RESOLUTION' } }
          ]
        }
      });

      if (betsData) {
        const transformedBets: TestBet[] = betsData
          .filter(bet => bet.id && bet.title && bet.status)
          .map(bet => {
            let sideAName = 'Side A';
            let sideBName = 'Side B';

            try {
              const odds = typeof bet.odds === 'string' ? JSON.parse(bet.odds) : bet.odds;
              sideAName = odds?.sideAName || 'Side A';
              sideBName = odds?.sideBName || 'Side B';
            } catch (error) {
              console.error('Error parsing bet odds:', error);
            }

            return {
              id: bet.id!,
              title: bet.title!,
              status: bet.status!,
              totalPot: bet.totalPot || 0,
              sideAName,
              sideBName,
              createdAt: bet.createdAt || new Date().toISOString()
            };
          });

        setTestBets(transformedBets);
        console.log('[AdminDashboard] Loaded test bets:', transformedBets.length);
      }
    } catch (error) {
      console.error('[AdminDashboard] Error loading test bets:', error);
    }
  };

  // Create test bet
  const handleCreateTestBet = async () => {
    if (!user?.userId) return;

    if (!testBetTitle.trim() || !testBetDescription.trim()) {
      showAlert('Error', 'Please enter a title and description for the test bet.');
      return;
    }

    const amount = parseFloat(testBetAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Error', 'Please enter a valid bet amount.');
      return;
    }

    const deadlineMinutes = parseInt(testBetDeadline);
    if (isNaN(deadlineMinutes) || deadlineMinutes <= 0) {
      showAlert('Error', 'Please enter a valid deadline in minutes.');
      return;
    }

    try {
      setIsCreatingBet(true);
      console.log('[AdminDashboard] Creating test bet...');

      // Calculate deadline
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + deadlineMinutes);

      // Create bet
      const { data: newBet } = await client.models.Bet.create({
        title: testBetTitle.trim(),
        description: testBetDescription.trim(),
        category: 'CUSTOM',
        status: 'ACTIVE',
        creatorId: user.userId,
        totalPot: amount,
        betAmount: amount,
        odds: JSON.stringify({
          sideAName: testBetSideA.trim() || 'Yes',
          sideBName: testBetSideB.trim() || 'No'
        }),
        deadline: deadline.toISOString(),
        isPrivate: false, // Public test bet
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (!newBet) {
        throw new Error('Failed to create bet');
      }

      // Create participant entry for the creator
      await client.models.Participant.create({
        betId: newBet.id,
        userId: user.userId,
        side: 'A', // Admin takes Side A by default
        amount: amount,
        status: 'ACCEPTED',
        payout: 0,
        joinedAt: new Date().toISOString()
      });

      // Deduct balance using TransactionService
      await TransactionService.recordBetPlacement(
        user.userId,
        amount,
        newBet.id,
        'creator'
      );

      showAlert('Success', 'Test bet created successfully!');

      // Clear form
      setTestBetTitle('');
      setTestBetDescription('');
      setTestBetAmount('10');
      setTestBetSideA('Yes');
      setTestBetSideB('No');
      setTestBetDeadline('60');

      // Reload pending transactions to see balance change
      await loadPendingTransactions();
    } catch (error) {
      console.error('[AdminDashboard] Error creating test bet:', error);
      showAlert('Error', 'Failed to create test bet. Please try again.');
    } finally {
      setIsCreatingBet(false);
    }
  };

  // Resolve test bet
  const handleResolveTestBet = async (betId: string, winningSide: 'A' | 'B') => {
    if (!user?.userId) return;

    try {
      setResolvingBetId(betId);
      console.log('[AdminDashboard] Resolving test bet:', betId, 'Winner:', winningSide);

      // Get bet details first
      const { data: betData } = await client.models.Bet.get({ id: betId });
      if (!betData) {
        throw new Error('Bet not found');
      }

      // Get participants
      const { data: participants } = await client.models.Participant.list({
        filter: { betId: { eq: betId } }
      });

      if (!participants || participants.length === 0) {
        throw new Error('No participants found');
      }

      // Parse odds
      let sideAName = 'Side A';
      let sideBName = 'Side B';
      try {
        const odds = typeof betData.odds === 'string' ? JSON.parse(betData.odds) : betData.odds;
        sideAName = odds?.sideAName || 'Side A';
        sideBName = odds?.sideBName || 'Side B';
      } catch (error) {
        console.error('Error parsing bet odds:', error);
      }

      // Calculate payouts
      const winners = participants.filter(p => p.side === winningSide);
      const totalWinnerAmount = winners.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalPot = betData.totalPot || 0;

      // Calculate dispute window end time (48 hours from now)
      const disputeWindowEndsAt = new Date();
      disputeWindowEndsAt.setHours(disputeWindowEndsAt.getHours() + 48);

      // Update bet status
      await client.models.Bet.update({
        id: betId,
        status: 'PENDING_RESOLUTION',
        winningSide: winningSide,
        resolutionReason: `Resolved by admin. Winner: ${winningSide === 'A' ? sideAName : sideBName}`,
        disputeWindowEndsAt: disputeWindowEndsAt.toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update participants and create transactions
      await Promise.all(
        participants.map(async (participant) => {
          const isWinner = participant.side === winningSide;
          let payout = 0;

          if (isWinner && totalWinnerAmount > 0) {
            const winnerShare = (participant.amount || 0) / totalWinnerAmount;
            payout = totalPot * winnerShare;
          }

          // Update participant record
          await client.models.Participant.update({
            id: participant.id!,
            payout: payout,
            status: isWinner ? 'ACCEPTED' : 'DECLINED'
          });

          // Create pending transaction for winners
          if (isWinner && payout > 0 && participant.userId) {
            const { data: userData } = await client.models.User.get({ id: participant.userId });
            const currentBalance = userData?.balance || 0;

            await client.models.Transaction.create({
              userId: participant.userId,
              type: 'BET_WON',
              status: 'PENDING',
              amount: payout,
              balanceBefore: currentBalance,
              balanceAfter: currentBalance + payout,
              relatedBetId: betId,
              relatedParticipantId: participant.id,
              notes: `Test bet winnings (pending 48h dispute window): ${betData.title}`,
              createdAt: new Date().toISOString()
            });
          }
        })
      );

      showAlert('Success', `Test bet resolved! Winner: ${winningSide === 'A' ? sideAName : sideBName}\n\nPayouts are pending a 48-hour dispute window.`);

      // Reload test bets
      await loadTestBets();
    } catch (error) {
      console.error('[AdminDashboard] Error resolving test bet:', error);
      showAlert('Error', 'Failed to resolve test bet. Please try again.');
    } finally {
      setResolvingBetId(null);
    }
  };

  // Load test bets when filter changes to TEST_BETS
  useEffect(() => {
    if (filter === 'TEST_BETS') {
      loadTestBets();
    }
  }, [filter, user?.userId]);

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
        <TouchableOpacity
          style={[styles.filterButton, filter === 'TEST_BETS' && styles.filterButtonActive]}
          onPress={() => setFilter('TEST_BETS')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterButtonText, filter === 'TEST_BETS' && styles.filterButtonTextActive]}>
            Test Bets
          </Text>
        </TouchableOpacity>
      </View>

      {/* Transactions List OR Test Bets Section */}
      {filter === 'TEST_BETS' ? (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadTestBets} tintColor={colors.primary} />
          }
        >
          {/* Create Test Bet Form */}
          <View style={styles.testBetSection}>
            <Text style={styles.testBetSectionTitle}>Create Test Bet</Text>
            <View style={styles.testBetForm}>
              <TextInput
                style={styles.testBetInput}
                placeholder="Bet Title"
                placeholderTextColor={colors.textMuted}
                value={testBetTitle}
                onChangeText={setTestBetTitle}
              />
              <TextInput
                style={[styles.testBetInput, styles.testBetTextArea]}
                placeholder="Bet Description"
                placeholderTextColor={colors.textMuted}
                value={testBetDescription}
                onChangeText={setTestBetDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={styles.testBetRow}>
                <View style={styles.testBetInputHalf}>
                  <Text style={styles.testBetLabel}>Amount ($)</Text>
                  <TextInput
                    style={styles.testBetInput}
                    placeholder="10"
                    placeholderTextColor={colors.textMuted}
                    value={testBetAmount}
                    onChangeText={setTestBetAmount}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.testBetInputHalf}>
                  <Text style={styles.testBetLabel}>Deadline (minutes)</Text>
                  <TextInput
                    style={styles.testBetInput}
                    placeholder="60"
                    placeholderTextColor={colors.textMuted}
                    value={testBetDeadline}
                    onChangeText={setTestBetDeadline}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={styles.testBetRow}>
                <View style={styles.testBetInputHalf}>
                  <Text style={styles.testBetLabel}>Side A Name</Text>
                  <TextInput
                    style={styles.testBetInput}
                    placeholder="Yes"
                    placeholderTextColor={colors.textMuted}
                    value={testBetSideA}
                    onChangeText={setTestBetSideA}
                  />
                </View>
                <View style={styles.testBetInputHalf}>
                  <Text style={styles.testBetLabel}>Side B Name</Text>
                  <TextInput
                    style={styles.testBetInput}
                    placeholder="No"
                    placeholderTextColor={colors.textMuted}
                    value={testBetSideB}
                    onChangeText={setTestBetSideB}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.testBetCreateButton, isCreatingBet && styles.testBetCreateButtonDisabled]}
                onPress={handleCreateTestBet}
                disabled={isCreatingBet}
                activeOpacity={0.7}
              >
                {isCreatingBet ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color={colors.background} />
                    <Text style={styles.testBetCreateButtonText}>Create Test Bet</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Pending Resolution Test Bets */}
          <View style={styles.testBetSection}>
            <Text style={styles.testBetSectionTitle}>Resolve Test Bets</Text>
            {testBets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.success} />
                <Text style={styles.emptyDescription}>
                  No test bets pending resolution
                </Text>
              </View>
            ) : (
              testBets.map((bet) => (
                <View key={bet.id} style={styles.testBetCard}>
                  <View style={styles.testBetCardHeader}>
                    <Text style={styles.testBetCardTitle}>{bet.title}</Text>
                    <Text style={styles.testBetCardPot}>{formatCurrency(bet.totalPot)}</Text>
                  </View>
                  <View style={styles.testBetCardActions}>
                    <TouchableOpacity
                      style={[styles.testBetSideButton, styles.testBetSideButtonA]}
                      onPress={() => handleResolveTestBet(bet.id, 'A')}
                      disabled={resolvingBetId === bet.id}
                      activeOpacity={0.7}
                    >
                      {resolvingBetId === bet.id ? (
                        <ActivityIndicator size="small" color={colors.background} />
                      ) : (
                        <Text style={styles.testBetSideButtonText}>{bet.sideAName}</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.testBetSideButton, styles.testBetSideButtonB]}
                      onPress={() => handleResolveTestBet(bet.id, 'B')}
                      disabled={resolvingBetId === bet.id}
                      activeOpacity={0.7}
                    >
                      {resolvingBetId === bet.id ? (
                        <ActivityIndicator size="small" color={colors.background} />
                      ) : (
                        <Text style={styles.testBetSideButtonText}>{bet.sideBName}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
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
      )}

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
                      verificationCode.length !== 4 && styles.approvalModalConfirmButtonDisabled
                    ]}
                    onPress={handleConfirmApprove}
                    disabled={verificationCode.length !== 4}
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

  // Test Bet Section
  testBetSection: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  testBetSectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.md,
  },
  testBetForm: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
  },
  testBetInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    padding: spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  testBetTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  testBetRow: {
    flexDirection: 'row',
    marginHorizontal: -spacing.xs / 2,
  },
  testBetInputHalf: {
    flex: 1,
    marginHorizontal: spacing.xs / 2,
  },
  testBetLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs / 2,
  },
  testBetCreateButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  testBetCreateButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  testBetCreateButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  testBetCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  testBetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  testBetCardTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  testBetCardPot: {
    ...textStyles.h4,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    marginLeft: spacing.sm,
  },
  testBetCardActions: {
    flexDirection: 'row',
  },
  testBetSideButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs / 2,
  },
  testBetSideButtonA: {
    backgroundColor: colors.success,
  },
  testBetSideButtonB: {
    backgroundColor: colors.error,
  },
  testBetSideButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
});
