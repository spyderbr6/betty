/**
 * Pending bet and squares invitations.
 *
 * Lives on the Join tab rather than My Bets. An invitation is a request waiting
 * on the viewer, and the Join tab is where a bet is accepted, so the badge that
 * announces it and the screen that clears it are now the same place. My Bets
 * keeps a dot that points here.
 *
 * Self-contained on purpose: it reads the invitations and the accept/decline
 * actions from BetDataContext itself, so a host screen supplies only navigation
 * and an optional toast. That is what lets it drop in as a FlatList
 * ListHeaderComponent without the surrounding screen owning any of this state.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BetInvitationCard } from './BetInvitationCard';
import { useBetData } from '../../contexts/BetDataContext';
import { useAuth } from '../../contexts/AuthContext';
import { BetInvitation, SquaresInvitation } from '../../types/betting';
import { colors, typography, spacing, textStyles } from '../../styles';

interface PendingInvitationsProps {
  /** The host screen decides where a squares game opens. */
  onSquaresPress: (gameId: string) => void;
  /** Optional success-message sink; the host owns its own toast. */
  onToast?: (message: string) => void;
}

export const PendingInvitations: React.FC<PendingInvitationsProps> = ({
  onSquaresPress,
  onToast,
}) => {
  const { user } = useAuth();
  const {
    betInvitations,
    squaresInvitations,
    acceptBetInvitation: contextAcceptInvitation,
    declineBetInvitation: contextDeclineInvitation,
    declineSquaresInvitation: contextDeclineSquaresInvitation,
  } = useBetData();
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const mark = (id: string, busy: boolean) =>
    setProcessing((prev) => {
      const next = new Set(prev);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });

  const acceptBet = async (invitation: BetInvitation, selectedSide: string) => {
    if (!user?.userId || !invitation.bet || !selectedSide) return;
    const betAmount = invitation.bet.betAmount || 0;
    try {
      mark(invitation.id, true);
      const success = await contextAcceptInvitation(invitation, selectedSide);
      if (success) {
        const odds = invitation.bet.odds || { sideAName: 'Side A', sideBName: 'Side B' };
        const sideName =
          selectedSide === 'A' ? odds.sideAName || 'Side A' : odds.sideBName || 'Side B';
        onToast?.(
          `Joined "${invitation.bet.title}" on ${sideName}! $${betAmount.toFixed(2)} deducted.`
        );
      }
    } finally {
      mark(invitation.id, false);
    }
  };

  const declineBet = async (invitation: BetInvitation) => {
    try {
      mark(invitation.id, true);
      await contextDeclineInvitation(invitation);
    } finally {
      mark(invitation.id, false);
    }
  };

  const declineSquares = async (invitation: SquaresInvitation) => {
    try {
      mark(invitation.id, true);
      await contextDeclineSquaresInvitation(invitation);
    } finally {
      mark(invitation.id, false);
    }
  };

  if (betInvitations.length === 0 && squaresInvitations.length === 0) return null;

  return (
    <View testID="pending-invitations">
      {betInvitations.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>PENDING INVITATIONS</Text>
            <View style={styles.invitationBadge}>
              <Text style={styles.invitationBadgeText} testID="pending-bet-count">
                {betInvitations.length}
              </Text>
            </View>
          </View>

          {betInvitations.map((invitation) => (
            <BetInvitationCard
              key={invitation.id}
              invitation={invitation}
              onAccept={(side) => acceptBet(invitation, side)}
              onDecline={() => declineBet(invitation)}
              isProcessing={processing.has(invitation.id)}
            />
          ))}
        </>
      )}

      {squaresInvitations.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SQUARES INVITATIONS</Text>
            <View style={styles.invitationBadge}>
              <Text style={styles.invitationBadgeText} testID="pending-squares-count">
                {squaresInvitations.length}
              </Text>
            </View>
          </View>

          {squaresInvitations.map((invitation: SquaresInvitation) => (
            <View key={invitation.id} style={styles.squaresInvitationCard}>
              <TouchableOpacity
                style={styles.squaresInvitationTappable}
                onPress={() => onSquaresPress(invitation.squaresGameId)}
                activeOpacity={0.8}
              >
                <View style={styles.squaresInvitationContent}>
                  <View style={styles.squaresInvitationHeader}>
                    <Ionicons name="grid-outline" size={20} color={colors.primary} />
                    <Text style={styles.squaresInvitationTitle} numberOfLines={1}>
                      {invitation.squaresGame?.title || 'Squares Game'}
                    </Text>
                  </View>
                  <Text style={styles.squaresInvitationFrom}>
                    From{' '}
                    {invitation.fromUser?.displayName ||
                      invitation.fromUser?.username ||
                      'Unknown'}
                  </Text>
                  {invitation.squaresGame?.pricePerSquare != null && (
                    <Text style={styles.squaresInvitationPrice}>
                      ${invitation.squaresGame.pricePerSquare} per square
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.squaresInvitationActions}>
                <TouchableOpacity
                  style={styles.squaresDeclineButton}
                  onPress={() => declineSquares(invitation)}
                  disabled={processing.has(invitation.id)}
                  activeOpacity={0.7}
                >
                  {processing.has(invitation.id) ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <>
                      <Ionicons name="close" size={14} color={colors.error} />
                      <Text style={styles.squaresDeclineText}>Decline</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.squaresViewButton}
                  onPress={() => onSquaresPress(invitation.squaresGameId)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={14} color={colors.background} />
                  <Text style={styles.squaresViewText}>View &amp; Join</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
