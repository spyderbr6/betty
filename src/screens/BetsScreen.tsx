/**
 * Bets Screen
 * Main betting screen showing active bets list
 */

import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { commonStyles, colors, spacing, typography, textStyles } from '../styles';
import { Header } from '../components/ui/Header';
import { BetCard } from '../components/betting/BetCard';
import { SquaresGameCard } from '../components/betting/SquaresGameCard';
import { BetInviteModal } from '../components/ui/BetInviteModal';
import { Bet, BetInvitation } from '../types/betting';
import { BetsStackParamList } from '../types/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useBetData } from '../contexts/BetDataContext';
import { showAlert } from '../components/ui/CustomAlert';

type BetsScreenNavigationProp = StackNavigationProp<BetsStackParamList, 'BetsList'>;

// Initialize GraphQL client
const client = generateClient<Schema>();

// Data loading and transformations are now handled by BetDataContext

export const BetsScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<BetsScreenNavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    myBets,
    mySquaresGames: squaresGames,
    betInvitations,
    isInitialLoading: isLoading,
    isRefreshing: refreshing,
    refresh,
    acceptBetInvitation: contextAcceptInvitation,
    declineBetInvitation: contextDeclineInvitation,
  } = useBetData();
  const [processingInvitations, setProcessingInvitations] = useState<Set<string>>(new Set());

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedBetForInvite, setSelectedBetForInvite] = useState<Bet | null>(null);

  // Handle bet invitation acceptance via context
  const acceptBetInvitation = async (invitation: BetInvitation, selectedSide: string) => {
    if (!user?.userId || !invitation.bet || !selectedSide) return;

    const betAmount = invitation.bet.betAmount || 0;

    try {
      setProcessingInvitations(prev => new Set(prev).add(invitation.id));

      const success = await contextAcceptInvitation(invitation, selectedSide);

      if (success) {
        const betOdds = invitation.bet.odds || { sideAName: 'Side A', sideBName: 'Side B' };
        const joinedSideName = selectedSide === 'A' ? (betOdds.sideAName || 'Side A') : (betOdds.sideBName || 'Side B');
        setToastMessage(`Joined "${invitation.bet.title}" on ${joinedSideName}! $${betAmount.toFixed(2)} deducted.`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  // Handle bet invitation decline via context
  const declineBetInvitation = async (invitation: BetInvitation) => {
    try {
      setProcessingInvitations(prev => new Set(prev).add(invitation.id));
      await contextDeclineInvitation(invitation);
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.id);
        return newSet;
      });
    }
  };

  // Handle refresh via context
  const onRefresh = async () => {
    await refresh();
  };

  const handleSquaresGamePress = (gameId: string) => {
    console.log('[BetsScreen] Navigating to squares game:', gameId);
    navigation.navigate('SquaresGameDetail', { gameId });
  };

  const handleBetPress = (bet: Bet) => {
    console.log('Bet pressed:', bet.title);
  };

  const handleBalancePress = () => {
    console.log('Balance pressed');
  };

  const handleEndBet = async (bet: Bet) => {
    try {
      await client.models.Bet.update({
        id: bet.id,
        status: 'PENDING_RESOLUTION',
        updatedAt: new Date().toISOString(),
      });
      showAlert('Bet Ended', 'Your bet has been moved to pending resolution. You can now declare the winner.');
    } catch (error) {
      console.error('Error ending bet:', error);
      showAlert('Error', 'Failed to end bet. Please try again.');
    }
  };

  // Removed - Header handles notifications internally now


  // Real user stats state
  const [userStats, setUserStats] = useState({
    winRate: 0,
    trustScore: 0,
  });

  // Fetch real user stats
  useEffect(() => {
    const fetchUserStats = async () => {
      if (user?.userId) {
        try {
          const { data: userData } = await client.models.User.get({ id: user.userId });
          if (userData) {
            setUserStats({
              winRate: userData.winRate || 0,
              trustScore: userData.trustScore || 0,
            });
          }
        } catch (error) {
          console.error('Error fetching user stats:', error);
        }
      }
    };

    fetchUserStats();
  }, [user]);


  // Filter for user's ACTIVE bets only (myBets from context already filters by involvement)
  const filteredBets = myBets.filter(bet => bet.status === 'ACTIVE');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header
        showBalance={true}
        onBalancePress={handleBalancePress}
      />

      {/* Toast Banner */}
      {showToast && (
        <View style={styles.toastBanner}>
          <Ionicons name="checkmark-circle" size={20} color={colors.background} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: spacing.navigation.baseHeight + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Bet Invitations Section */}
        {betInvitations.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PENDING INVITATIONS</Text>
              <View style={styles.invitationBadge}>
                <Text style={styles.invitationBadgeText}>{betInvitations.length}</Text>
              </View>
            </View>

            {betInvitations.map((invitation) => (
              <BetInvitationCard
                key={invitation.id}
                invitation={invitation}
                onAccept={(side) => acceptBetInvitation(invitation, side)}
                onDecline={() => declineBetInvitation(invitation)}
                isProcessing={processingInvitations.has(invitation.id)}
              />
            ))}
          </>
        )}

        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* Squares Games Section */}
            {squaresGames.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>BETTING SQUARES</Text>
                </View>

                {squaresGames.map((game) => (
                  <SquaresGameCard
                    key={game.id}
                    squaresGame={game}
                    onPress={() => handleSquaresGamePress(game.id)}
                  />
                ))}
              </>
            )}

            {/* Bets Section */}
            {filteredBets.length > 0 ? (
              <>
                {squaresGames.length > 0 && (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>ACTIVE BETS</Text>
                  </View>
                )}
                {filteredBets.map((bet) => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    onPress={handleBetPress}
                    onJoinBet={() => {}}
                    onInviteFriends={(bet) => {
                      setSelectedBetForInvite(bet);
                      setShowInviteModal(true);
                    }}
                    onEndBet={handleEndBet}
                  />
                ))}
              </>
            ) : null}

            {/* Empty State - only show if no bets AND no squares */}
            {filteredBets.length === 0 && squaresGames.length === 0 && (
              <View style={styles.emptyStateCard}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="dice-outline" size={48} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No Active Games</Text>
                <Text style={styles.emptyDescription}>
                  You don't have any active bets or squares games yet. Get started by creating your own bet or finding one to join!
                </Text>
                <View style={styles.emptyActionButtons}>
                  <TouchableOpacity
                    style={styles.emptyActionButton}
                    onPress={() => navigation.getParent()?.navigate('Create')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.background} />
                    <Text style={styles.emptyActionButtonText}>Create a Bet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyActionButton, styles.emptyActionButtonSecondary]}
                    onPress={() => navigation.getParent()?.navigate('Live')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="search-outline" size={20} color={colors.primary} />
                    <Text style={[styles.emptyActionButtonText, styles.emptyActionButtonTextSecondary]}>Find Bets to Join</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* Bottom Stats */}
        <View style={styles.bottomStatsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{filteredBets.length + squaresGames.length}</Text>
              <Text style={styles.statLabel}>ACTIVE</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.winRate.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>WIN RATE</Text>
            </View>

            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userStats.trustScore.toFixed(1)}</Text>
              <Text style={styles.statLabel}>TRUST SCORE</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bet Invite Modal */}
      {selectedBetForInvite && (
        <BetInviteModal
          visible={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            setSelectedBetForInvite(null);
          }}
          bet={selectedBetForInvite}
          onInvitesSent={(count) => {
            setToastMessage(`Successfully invited ${count} friend${count > 1 ? 's' : ''}!`);
            setShowToast(true);
            setTimeout(() => {
              setShowToast(false);
            }, 3000);
          }}
        />
      )}
    </SafeAreaView>
  );
};

// Bet Invitation Card Component
interface BetInvitationCardProps {
  invitation: BetInvitation;
  onAccept: (side: string) => void;
  onDecline: () => void;
  isProcessing: boolean;
}

const BetInvitationCard: React.FC<BetInvitationCardProps> = ({
  invitation,
  onAccept,
  onDecline,
  isProcessing,
}) => {
  const [selectedSide, setSelectedSide] = React.useState<string | null>(null);

  if (!invitation.bet) return null;

  const parseBetOdds = (odds: any) => {
    try {
      const parsedOdds = typeof odds === 'string' ? JSON.parse(odds) : odds;
      return {
        sideAName: parsedOdds?.sideAName || 'Side A',
        sideBName: parsedOdds?.sideBName || 'Side B',
      };
    } catch {
      return {
        sideAName: 'Side A',
        sideBName: 'Side B',
      };
    }
  };

  const betOdds = parseBetOdds(invitation.bet.odds);
  const hasSpecificSide = invitation.invitedSide && invitation.invitedSide.trim() !== '';
  const invitedSideName = hasSpecificSide
    ? (invitation.invitedSide === 'A' ? betOdds.sideAName : betOdds.sideBName)
    : null;
  const timeUntilExpiry = new Date(invitation.expiresAt).getTime() - new Date().getTime();
  const hoursLeft = Math.max(0, Math.floor(timeUntilExpiry / (1000 * 60 * 60)));

  // Use denormalized counts from bet record
  const sideACount = invitation.bet.sideACount || 0;
  const sideBCount = invitation.bet.sideBCount || 0;

  return (
    <View style={[styles.betCard, styles.invitationCard]}>
      {/* Invitation Header */}
      <View style={styles.invitationHeader}>
        <View style={styles.invitationFromUser}>
          <View style={styles.userAvatarSmall}>
            <Text style={styles.userAvatarTextSmall}>
              {(invitation.fromUser?.displayName || invitation.fromUser?.email?.split('@')[0] || '?')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.invitationFromText}>
            {invitation.fromUser?.displayName || invitation.fromUser?.email?.split('@')[0]} invited you
          </Text>
        </View>
        <View style={styles.expiryContainer}>
          <Ionicons name="time-outline" size={12} color={colors.warning} />
          <Text style={styles.expiryText}>{hoursLeft}h left</Text>
        </View>
      </View>

      {/* Bet Details */}
      <View style={styles.invitationBetDetails}>
        <View style={styles.invitationTitleRow}>
          <Text style={styles.invitationBetTitle}>{invitation.bet.title}</Text>
          <Text style={styles.invitationAmount}>${invitation.bet.betAmount || 0}</Text>
        </View>
        <Text style={styles.invitationBetDescription} numberOfLines={2}>
          {invitation.bet.description}
        </Text>

        {hasSpecificSide && (
          <View style={styles.invitationSideInfo}>
            <Text style={styles.invitationSideLabel}>Your side:</Text>
            <Text style={styles.invitationSideName}>{invitedSideName}</Text>
          </View>
        )}

        {/* Side Selection - only show if no specific side is invited */}
        {!hasSpecificSide && (
          <View style={styles.sideSelectionContainer}>
            <Text style={styles.sideSelectionLabel}>Choose your side:</Text>
            <View style={styles.sideOptions}>
              <TouchableOpacity
                style={[
                  styles.sideOption,
                  selectedSide === 'A' && styles.sideOptionSelected
                ]}
                onPress={() => setSelectedSide('A')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.sideOptionIndicator,
                  selectedSide === 'A' && styles.sideOptionIndicatorSelected
                ]} />
                <View style={styles.sideOptionContent}>
                  <Text style={[
                    styles.sideOptionText,
                    selectedSide === 'A' && styles.sideOptionTextSelected
                  ]}>
                    {betOdds.sideAName}
                  </Text>
                  <View style={styles.sideOptionParticipants}>
                    <Ionicons name="people-outline" size={11} color={selectedSide === 'A' ? colors.background : colors.textMuted} />
                    <Text style={[
                      styles.sideOptionParticipantCount,
                      selectedSide === 'A' && styles.sideOptionParticipantCountSelected
                    ]}>
                      {sideACount}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sideOption,
                  styles.sideOptionLast,
                  selectedSide === 'B' && styles.sideOptionSelected
                ]}
                onPress={() => setSelectedSide('B')}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.sideOptionIndicator,
                  selectedSide === 'B' && styles.sideOptionIndicatorSelected
                ]} />
                <View style={styles.sideOptionContent}>
                  <Text style={[
                    styles.sideOptionText,
                    selectedSide === 'B' && styles.sideOptionTextSelected
                  ]}>
                    {betOdds.sideBName}
                  </Text>
                  <View style={styles.sideOptionParticipants}>
                    <Ionicons name="people-outline" size={11} color={selectedSide === 'B' ? colors.background : colors.textMuted} />
                    <Text style={[
                      styles.sideOptionParticipantCount,
                      selectedSide === 'B' && styles.sideOptionParticipantCountSelected
                    ]}>
                      {sideBCount}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.invitationActions}>
        <TouchableOpacity
          style={[styles.invitationButton, styles.declineButton]}
          onPress={onDecline}
          disabled={isProcessing}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <>
              <Ionicons name="close" size={16} color={colors.error} />
              <Text style={[styles.invitationButtonText, styles.declineButtonText]}>
                Decline
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.invitationButton,
            styles.acceptButton,
            (!hasSpecificSide && !selectedSide) && styles.acceptButtonDisabled
          ]}
          onPress={() => onAccept(hasSpecificSide ? invitation.invitedSide : selectedSide!)}
          disabled={isProcessing || (!hasSpecificSide && !selectedSide)}
          activeOpacity={0.7}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Ionicons
                name="checkmark"
                size={16}
                color={(!hasSpecificSide && !selectedSide) ? colors.textMuted : colors.background}
              />
              <Text style={[
                styles.invitationButtonText,
                styles.acceptButtonText,
                (!hasSpecificSide && !selectedSide) && styles.acceptButtonTextDisabled
              ]}>
                Accept & Join
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },


  // Section Header (for invitations)
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.lg,
  },

  // Loading and Empty States
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  emptyStateCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    marginHorizontal: spacing.md,
    marginVertical: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  emptyActionButtons: {
    width: '100%',
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.radius.md,
    marginBottom: spacing.sm,
  },
  emptyActionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 0,
  },
  emptyActionButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  emptyActionButtonTextSecondary: {
    color: colors.primary,
  },

  // Bottom Stats
  bottomStatsContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...textStyles.h2,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.xl,
    textAlign: 'center',
  },
  statLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    textAlign: 'center',
    textTransform: 'uppercase',
  },

  // Invitation Badge
  invitationBadge: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitationBadgeText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },

  // Bet Card Base
  betCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Invitation Card Styles
  invitationCard: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '08',
  },
  invitationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  invitationFromUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  userAvatarTextSmall: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  invitationFromText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  expiryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryText: {
    ...textStyles.caption,
    color: colors.warning,
    fontSize: 11,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.medium,
  },

  // Invitation Bet Details
  invitationBetDetails: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  invitationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs / 2,
  },
  invitationBetTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  invitationBetDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  invitationBetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  invitationSideInfo: {
    flex: 1,
  },
  invitationSideLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  invitationSideName: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  invitationAmountInfo: {
    alignItems: 'flex-end',
  },
  invitationAmountLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  invitationAmount: {
    ...textStyles.pot,
    color: colors.warning,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  invitationMessage: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xs,
    padding: spacing.xs,
    marginTop: spacing.xs,
  },
  invitationMessageText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontSize: 12,
    lineHeight: 16,
  },

  // Invitation Actions
  invitationActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  invitationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  declineButton: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: spacing.radius.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.radius.md,
  },
  invitationButtonText: {
    ...textStyles.button,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  declineButtonText: {
    color: colors.error,
  },
  acceptButtonText: {
    color: colors.background,
  },
  acceptButtonDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  acceptButtonTextDisabled: {
    color: colors.textMuted,
  },

  // Side Selection Styles
  sideSelectionContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sideSelectionLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  sideOptions: {
    flexDirection: 'row',
  },
  sideOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.sm,
    marginRight: spacing.sm,
  },
  sideOptionLast: {
    marginRight: 0,
  },
  sideOptionSelected: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  sideOptionIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.xs,
    backgroundColor: colors.background,
  },
  sideOptionIndicatorSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  sideOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideOptionText: {
    ...textStyles.button,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  sideOptionTextSelected: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  sideOptionParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  sideOptionParticipantCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: 3,
  },
  sideOptionParticipantCountSelected: {
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },

  // Toast Banner
  toastBanner: {
    backgroundColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: spacing.radius.sm,
  },
  toastText: {
    ...textStyles.button,
    color: colors.background,
    marginLeft: spacing.xs,
    fontWeight: typography.fontWeight.medium,
    textAlign: 'center',
  },
});
