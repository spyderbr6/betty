/**
 * Bet Details Screen
 * Shows full bet info, sides breakdown, user participation, and debug IDs
 * Navigated to from Betting History when tapping a bet transaction
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { BetsStackParamList } from '../types/navigation';
import { colors, spacing, textStyles, typography, shadows } from '../styles';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatCategory } from '../utils/formatting';
import { TransactionService } from '../services/transactionService';

const client = generateClient<Schema>();

type Props = StackScreenProps<BetsStackParamList, 'BetDetails'>;

interface BetData {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  creatorId: string;
  creatorDisplayName: string;
  totalPot: number;
  betAmount?: number;
  odds: { sideAName: string; sideBName: string };
  deadline: string;
  winningSide?: string;
  resolutionReason?: string;
  sideACount: number;
  sideBCount: number;
  participantUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ParticipantData {
  id: string;
  side: string;
  amount: number;
  joinedAt: string;
}

interface WinTransactionData {
  payout: number;      // transaction.amount — net credited to user (already after fee)
  platformFee: number; // transaction.platformFee — fee taken (informational only)
}

export const BetDetailsScreen: React.FC<Props> = ({ navigation, route }) => {
  const { betId, returnToTab } = route.params;
  const { user } = useAuth();
  const [bet, setBet] = useState<BetData | null>(null);
  const [participant, setParticipant] = useState<ParticipantData | null>(null);
  const [winTransaction, setWinTransaction] = useState<WinTransactionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBetDetails();
  }, [betId]);

  const loadBetDetails = async () => {
    if (!user?.userId) return;
    try {
      setIsLoading(true);
      setError(null);

      const [betResult, participantsResult, allTransactions] = await Promise.all([
        client.models.Bet.get({ id: betId }),
        client.models.Participant.list({
          filter: { betId: { eq: betId }, userId: { eq: user.userId } },
        }),
        TransactionService.getUserTransactions(user.userId),
      ]);

      if (!betResult.data) {
        setError('Bet not found');
        return;
      }

      const raw = betResult.data;

      // Fetch creator's real display name
      let creatorDisplayName = raw.creatorName || '';
      if (!creatorDisplayName) {
        try {
          const { data: creatorUser } = await client.models.User.get({ id: raw.creatorId });
          creatorDisplayName = creatorUser?.displayName || creatorUser?.username || raw.creatorId;
        } catch {
          creatorDisplayName = raw.creatorId;
        }
      }

      setBet({
        id: raw.id,
        title: raw.title,
        description: raw.description,
        category: raw.category || 'CUSTOM',
        status: raw.status || 'ACTIVE',
        creatorId: raw.creatorId,
        creatorDisplayName,
        totalPot: raw.totalPot,
        betAmount: raw.betAmount || undefined,
        odds: (raw.odds as { sideAName: string; sideBName: string }) || {
          sideAName: 'Side A',
          sideBName: 'Side B',
        },
        deadline: raw.deadline,
        winningSide: raw.winningSide || undefined,
        resolutionReason: raw.resolutionReason || undefined,
        sideACount: raw.sideACount || 0,
        sideBCount: raw.sideBCount || 0,
        participantUserIds: (raw.participantUserIds?.filter(Boolean) as string[]) || [],
        createdAt: raw.createdAt || '',
        updatedAt: raw.updatedAt || '',
      });

      if (participantsResult.data && participantsResult.data.length > 0) {
        const p = participantsResult.data[0];
        setParticipant({
          id: p.id,
          side: p.side,
          amount: p.amount,
          joinedAt: p.joinedAt || '',
        });
      }

      // Find the BET_WON transaction for this bet using the same service billing history uses
      const winTx = allTransactions.find(
        t => t.type === 'BET_WON' && t.relatedBetId === betId
      );
      if (winTx) {
        setWinTransaction({
          payout: winTx.actualAmount ?? winTx.amount,
          platformFee: winTx.platformFee,
        });
      }
    } catch (err) {
      console.error('[BetDetails] Error loading bet:', err);
      setError('Failed to load bet details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (returnToTab) {
      // Navigate parent tab navigator back to the originating tab
      navigation.getParent()?.navigate(returnToTab);
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  const getUserResult = (): 'WON' | 'LOST' | null => {
    if (!bet || !participant || bet.status !== 'RESOLVED' || !bet.winningSide) return null;
    return participant.side === bet.winningSide ? 'WON' : 'LOST';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ACTIVE': return colors.success;
      case 'LIVE': return colors.live;
      case 'PENDING_RESOLUTION': return colors.warning;
      case 'RESOLVED': return colors.primary;
      case 'CANCELLED': return colors.textMuted;
      case 'DISPUTED': return colors.error;
      default: return colors.textSecondary;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'ACTIVE': return 'ACTIVE';
      case 'LIVE': return 'LIVE';
      case 'PENDING_RESOLUTION': return 'PENDING RESOLUTION';
      case 'RESOLVED': return 'RESOLVED';
      case 'CANCELLED': return 'CANCELLED';
      case 'DISPUTED': return 'DISPUTED';
      default: return status;
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBack}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Bet Details</Text>
      <View style={styles.headerRight} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !bet) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {renderHeader()}
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error || 'Bet not found'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBetDetails} activeOpacity={0.7}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sideAName = bet.odds?.sideAName || 'Side A';
  const sideBName = bet.odds?.sideBName || 'Side B';
  const isCreator = user?.userId === bet.creatorId;
  const userResult = getUserResult();
  const totalParticipants = (bet.sideACount || 0) + (bet.sideBCount || 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* User Result Hero */}
        {userResult && (
          <View style={[
            styles.resultHero,
            { backgroundColor: userResult === 'WON' ? colors.success + '20' : colors.error + '20' },
          ]}>
            <Ionicons
              name={userResult === 'WON' ? 'trophy' : 'close-circle'}
              size={40}
              color={userResult === 'WON' ? colors.success : colors.error}
            />
            <Text style={[
              styles.resultText,
              { color: userResult === 'WON' ? colors.success : colors.error },
            ]}>
              YOU {userResult}
            </Text>
            {userResult === 'WON' && winTransaction && (
              <Text style={styles.resultSubtext}>
                Payout: {formatCurrency(winTransaction.payout)}
              </Text>
            )}
            {userResult === 'LOST' && participant && (
              <Text style={styles.resultSubtext}>
                Lost: {formatCurrency(participant.amount)}
              </Text>
            )}
          </View>
        )}

        {/* Status & Bet Info */}
        <View style={styles.card}>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(bet.status) + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: getStatusColor(bet.status) }]}>
                {getStatusLabel(bet.status)}
              </Text>
            </View>
            {isCreator && (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText}>CREATOR</Text>
              </View>
            )}
          </View>

          <Text style={styles.betTitle}>{bet.title}</Text>
          {!!bet.description && (
            <Text style={styles.betDescription}>{bet.description}</Text>
          )}

          <View style={styles.divider} />

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Created By</Text>
              <Text style={styles.infoValue}>{bet.creatorDisplayName}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Category</Text>
              <Text style={styles.infoValue}>{formatCategory(bet.category)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Bet Amount</Text>
              <Text style={styles.infoValue}>
                {bet.betAmount ? formatCurrency(bet.betAmount) : 'Open'}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total Pot</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {formatCurrency(bet.totalPot)}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Participants</Text>
              <Text style={styles.infoValue}>{totalParticipants}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>{formatDate(bet.createdAt)}</Text>
            </View>
            <View style={[styles.infoItem, { width: '100%' }]}>
              <Text style={styles.infoLabel}>Deadline</Text>
              <Text style={styles.infoValue}>{formatDate(bet.deadline)}</Text>
            </View>
          </View>
        </View>

        {/* Sides Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sides</Text>

          <View style={[
            styles.sideRow,
            bet.winningSide === 'A' && styles.winningSideRow,
            participant?.side === 'A' && !bet.winningSide && styles.yourSideRow,
          ]}>
            <View style={styles.sideInfo}>
              <View style={styles.sideLabelRow}>
                <Text style={styles.sideLabel}>{sideAName}</Text>
                {participant?.side === 'A' && (
                  <View style={styles.yourSideBadge}>
                    <Text style={styles.yourSideBadgeText}>YOUR SIDE</Text>
                  </View>
                )}
                {bet.winningSide === 'A' && (
                  <View style={styles.winnerBadge}>
                    <Ionicons name="trophy" size={10} color={colors.success} />
                    <Text style={styles.winnerBadgeText}>WINNER</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sideCount}>
                {bet.sideACount || 0} participant{bet.sideACount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={styles.sideLetter}>A</Text>
          </View>

          <View style={styles.vsDivider}>
            <View style={styles.vsDividerLine} />
            <Text style={styles.vsText}>VS</Text>
            <View style={styles.vsDividerLine} />
          </View>

          <View style={[
            styles.sideRow,
            bet.winningSide === 'B' && styles.winningSideRow,
            participant?.side === 'B' && !bet.winningSide && styles.yourSideRow,
          ]}>
            <View style={styles.sideInfo}>
              <View style={styles.sideLabelRow}>
                <Text style={styles.sideLabel}>{sideBName}</Text>
                {participant?.side === 'B' && (
                  <View style={styles.yourSideBadge}>
                    <Text style={styles.yourSideBadgeText}>YOUR SIDE</Text>
                  </View>
                )}
                {bet.winningSide === 'B' && (
                  <View style={styles.winnerBadge}>
                    <Ionicons name="trophy" size={10} color={colors.success} />
                    <Text style={styles.winnerBadgeText}>WINNER</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sideCount}>
                {bet.sideBCount || 0} participant{bet.sideBCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={styles.sideLetter}>B</Text>
          </View>

          {!!bet.resolutionReason && (
            <>
              <View style={styles.divider} />
              <Text style={styles.infoLabel}>Resolution Reason</Text>
              <Text style={styles.resolutionReason}>{bet.resolutionReason}</Text>
            </>
          )}
        </View>

        {/* Your Participation */}
        {participant && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Participation</Text>

            {/* Always-visible: side and amount bet */}
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Your Side</Text>
                <Text style={styles.infoValue}>
                  {participant.side === 'A' ? sideAName : sideBName}{' '}
                  <Text style={styles.sideLetterInline}>({participant.side})</Text>
                </Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Joined</Text>
                <Text style={styles.infoValue}>{formatDate(participant.joinedAt)}</Text>
              </View>
              <View style={[styles.infoItem, { width: '100%' }]}>
                <Text style={styles.infoLabel}>Amount Wagered</Text>
                <Text style={styles.infoValue}>{formatCurrency(participant.amount)}</Text>
              </View>
            </View>

            {/* Payout breakdown — only when resolved */}
            {bet.status === 'RESOLVED' && (
              <>
                <View style={styles.divider} />
                {userResult === 'WON' && winTransaction ? (
                  <>
                    <Text style={styles.payoutSectionLabel}>Payout</Text>
                    <View style={[styles.payoutRow, styles.payoutTotalRow]}>
                      <Text style={styles.payoutTotalLabel}>Received</Text>
                      <Text style={[styles.payoutTotalValue, { color: colors.success }]}>
                        {formatCurrency(winTransaction.payout)}
                      </Text>
                    </View>
                    {winTransaction.platformFee > 0 && (
                      <View style={[styles.payoutRow, { marginTop: spacing.xs }]}>
                        <Text style={styles.payoutLabel}>Platform Fee</Text>
                        <Text style={[styles.payoutValue, { color: colors.textMuted }]}>
                          {formatCurrency(winTransaction.platformFee)}
                        </Text>
                      </View>
                    )}
                  </>
                ) : userResult === 'WON' ? (
                  // Won but transaction not yet completed (still pending)
                  <View style={styles.payoutRow}>
                    <Text style={styles.payoutLabel}>Payout</Text>
                    <Text style={[styles.payoutValue, { color: colors.warning }]}>Pending</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.payoutSectionLabel}>Result</Text>
                    <View style={styles.payoutRow}>
                      <Text style={styles.payoutLabel}>Payout Received</Text>
                      <Text style={[styles.payoutValue, { color: colors.textMuted }]}>
                        {formatCurrency(0)}
                      </Text>
                    </View>
                    <View style={[styles.payoutRow, styles.payoutTotalRow]}>
                      <Text style={styles.payoutTotalLabel}>Net Result</Text>
                      <Text style={[styles.payoutTotalValue, { color: colors.error }]}>
                        − {formatCurrency(participant.amount)}
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}

        {/* Debug / ID Section */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="bug-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.cardTitle, { marginLeft: spacing.xs / 2, color: colors.textMuted }]}>
              Debug Info
            </Text>
          </View>

          <IdRow label="Bet ID" value={bet.id} />
          <IdRow label="Creator ID" value={bet.creatorId} />
          <IdRow label="Creator Name" value={bet.creatorDisplayName} mono={false} />
          {participant && <IdRow label="Participant ID" value={participant.id} />}
          {bet.winningSide && (
            <IdRow
              label="Winning Side"
              value={`${bet.winningSide} (${bet.winningSide === 'A' ? sideAName : sideBName})`}
              mono={false}
            />
          )}
          <IdRow label="Stored Participant IDs" value={`${bet.participantUserIds.length} total`} mono={false} />
          <IdRow label="Last Updated" value={formatDate(bet.updatedAt)} mono={false} />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
};

// Reusable ID row for the debug section
const IdRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = true,
}) => (
  <View style={styles.idRow}>
    <Text style={styles.idLabel}>{label}</Text>
    <Text style={[styles.idValue, !mono && styles.idValuePlain]} selectable>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 60,
  },
  backButton: {
    padding: spacing.xs,
    width: 40,
  },
  headerTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
  headerRight: {
    width: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },

  // Result hero
  resultHero: {
    borderRadius: spacing.radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resultText: {
    ...textStyles.h2,
    fontWeight: typography.fontWeight.black,
    marginTop: spacing.sm,
  },
  resultSubtext: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    ...textStyles.label,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    fontSize: 11,
    marginBottom: spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  // Badges row
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.xs,
  },
  statusBadgeText: {
    ...textStyles.caption,
    fontWeight: typography.fontWeight.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  creatorBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.primary + '20',
  },
  creatorBadgeText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },

  // Bet info
  betTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  betDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    marginBottom: spacing.sm,
  },
  infoLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  infoValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
    fontSize: typography.fontSize.sm,
  },
  sideLetterInline: {
    color: colors.textMuted,
    fontWeight: typography.fontWeight.normal,
  },

  // Sides
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.background,
  },
  winningSideRow: {
    backgroundColor: colors.success + '15',
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  yourSideRow: {
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  sideInfo: {
    flex: 1,
  },
  sideLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sideLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.xs,
  },
  yourSideBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    backgroundColor: colors.primary + '30',
    marginRight: spacing.xs / 2,
  },
  yourSideBadgeText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: spacing.radius.xs,
    backgroundColor: colors.success + '30',
    marginRight: spacing.xs / 2,
  },
  winnerBadgeText: {
    ...textStyles.caption,
    color: colors.success,
    fontWeight: typography.fontWeight.bold,
    fontSize: 9,
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  sideCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  sideLetter: {
    ...textStyles.h4,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.sm,
    width: 20,
    textAlign: 'right',
  },
  vsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  vsDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  vsText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
    fontSize: 10,
    paddingHorizontal: spacing.sm,
  },
  resolutionReason: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs / 2,
  },

  // Payout breakdown
  payoutSectionLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  payoutLabel: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
  },
  payoutValue: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  payoutTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs / 2,
  },
  payoutTotalLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
  payoutTotalValue: {
    ...textStyles.body,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
  },

  // Debug IDs
  idRow: {
    marginBottom: spacing.sm,
  },
  idLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  idValue: {
    fontFamily: typography.fontFamily.mono,
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    lineHeight: 16,
  },
  idValuePlain: {
    fontFamily: undefined,
    fontSize: typography.fontSize.sm,
  },

  bottomPad: {
    height: spacing.xl,
  },
});
