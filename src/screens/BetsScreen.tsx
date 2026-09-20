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
import { Bet, BetInvitation, SquaresInvitation } from '../types/betting';
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
    squaresInvitations,
    isInitialLoading: isLoading,
    isRefreshing: refreshing,
    refresh,
  } = useBetData();
  const pendingInvitationCount = betInvitations.length + squaresInvitations.length;

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedBetForInvite, setSelectedBetForInvite] = useState<Bet | null>(null);

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
    <SafeAreaView style={styles.container} edges={['top']} testID="screen-bets">
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
        {/* Invitations live on the Join tab now: that is where a bet is
            actually accepted, so the badge announcing one and the screen that
            clears it are the same place. This only points there. */}
        {pendingInvitationCount > 0 && (
          <TouchableOpacity
            style={styles.pendingPointer}
            onPress={() => navigation.getParent()?.navigate('Live')}
            activeOpacity={0.8}
            testID="bets-pending-pointer"
          >
            <Ionicons name="mail-unread-outline" size={18} color={colors.primary} />
            <Text style={styles.pendingPointerText}>
              {pendingInvitationCount} pending invitation
              {pendingInvitationCount === 1 ? '' : 's'} on the Join tab
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
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



const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  content: {
    flex: 1,
  },


  // Section Header (for invitations)
  pendingPointer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pendingPointerText: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
    flex: 1,
    marginLeft: spacing.sm,
  },
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

  // Invitation Card Styles

  // Invitation Bet Details
  invitationBetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  invitationAmountInfo: {
    alignItems: 'flex-end',
  },
  invitationAmountLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
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

  // Side Selection Styles

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

  // Squares Invitation Card
  squaresInvitationCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  squaresInvitationTappable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  squaresInvitationContent: {
    flex: 1,
  },
  squaresInvitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  squaresInvitationTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
    marginLeft: spacing.xs,
    flex: 1,
  },
  squaresInvitationFrom: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs / 2,
  },
  squaresInvitationPrice: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  squaresInvitationActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  squaresDeclineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  squaresDeclineText: {
    ...textStyles.button,
    color: colors.error,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs / 2,
  },
  squaresViewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  squaresViewText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs / 2,
  },
});
