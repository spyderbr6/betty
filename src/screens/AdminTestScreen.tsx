/**
 * Admin Test Screen
 * Admin-only screen for creating and managing test bets
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

interface AdminTestScreenProps {
  onClose: () => void;
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

export const AdminTestScreen: React.FC<AdminTestScreenProps> = ({ onClose }) => {
  const { user } = useAuth();

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
  const [refreshing, setRefreshing] = useState(false);

  // Check admin role on mount
  useEffect(() => {
    if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      showAlert(
        'Access Denied',
        'You do not have permission to access admin test functions.',
        [{ text: 'OK', onPress: onClose }]
      );
      return;
    }
    loadTestBets();
  }, []);

  // Load test bets (bets where isTestBet=true and creator is admin)
  const loadTestBets = async () => {
    if (!user?.userId) return;

    try {
      console.log('[AdminTest] Loading test bets...');
      const { data: betsData } = await client.models.Bet.list({
        filter: {
          and: [
            { creatorId: { eq: user.userId } },
            { isTestBet: { eq: true } },
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
        console.log('[AdminTest] Loaded test bets:', transformedBets.length);
      }
    } catch (error) {
      console.error('[AdminTest] Error loading test bets:', error);
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
      console.log('[AdminTest] Creating test bet...');

      // Calculate deadline
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + deadlineMinutes);

      // Create bet with isTestBet flag
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
        isTestBet: true, // Mark as test bet
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

      showAlert('Success', 'Test bet created successfully!\n\nOther users can now join this bet to test the full betting flow.');

      // Clear form
      setTestBetTitle('');
      setTestBetDescription('');
      setTestBetAmount('10');
      setTestBetSideA('Yes');
      setTestBetSideB('No');
      setTestBetDeadline('60');
    } catch (error) {
      console.error('[AdminTest] Error creating test bet:', error);
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
      console.log('[AdminTest] Resolving test bet:', betId, 'Winner:', winningSide);

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
        resolutionReason: `Resolved by admin test. Winner: ${winningSide === 'A' ? sideAName : sideBName}`,
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
      console.error('[AdminTest] Error resolving test bet:', error);
      showAlert('Error', 'Failed to resolve test bet. Please try again.');
    } finally {
      setResolvingBetId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTestBets();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Admin Test Functions" onClose={onClose} />

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="flask" size={20} color={colors.warning} />
        <Text style={styles.warningText}>Test Bet Management</Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Create Test Bet Form */}
        <View style={styles.testBetSection}>
          <Text style={styles.testBetSectionTitle}>Create Test Bet</Text>
          <Text style={styles.testBetSectionDescription}>
            Create a public test bet that any user can join. Use this to test bet flows, UI, disputes, and payouts.
          </Text>
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
          <Text style={styles.testBetSectionDescription}>
            Select the winning side to resolve your test bets. All participants will be notified.
          </Text>
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

  // Test Bet Section
  testBetSection: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
  },
  testBetSectionTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  testBetSectionDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
