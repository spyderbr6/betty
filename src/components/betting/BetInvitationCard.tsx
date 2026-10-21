/**
 * Invitation card with side selection.
 *
 * Extracted verbatim from BetsScreen, where it was a file-local component
 * sharing that screen's StyleSheet. Pending invitations now render on the Join
 * tab, so the card had to become importable; all 40 style keys it used were
 * exclusive to it, so they moved with it rather than being duplicated.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BetInvitation } from '../../types/betting';
import { colors, typography, spacing, textStyles } from '../../styles';
import { betOptions, isBetOption, isHeadToHead, optionCount, optionName, parseOdds } from '../../../amplify/shared/betOptions';

// Bet Invitation Card Component
interface BetInvitationCardProps {
  invitation: BetInvitation;
  onAccept: (side: string) => void;
  onDecline: () => void;
  isProcessing: boolean;
}

export const BetInvitationCard: React.FC<BetInvitationCardProps> = ({
  invitation,
  onAccept,
  onDecline,
  isProcessing,
}) => {
  const [selectedSide, setSelectedSide] = React.useState<string | null>(null);

  if (!invitation.bet) return null;

  const betOdds = parseOdds(invitation.bet.odds);
  const options = betOptions(betOdds);
  // A head-to-head bet leaves one side open: the invitation is to that side, whatever it says
  const openSide = isHeadToHead(invitation.bet)
    ? options.find((option) => optionCount(invitation.bet!, option.key) === 0)?.key
    : undefined;
  const invitedSide = openSide ?? (isBetOption(betOdds, invitation.invitedSide) ? invitation.invitedSide : '');
  const hasSpecificSide = invitedSide !== '';
  const invitedSideName = hasSpecificSide ? optionName(betOdds, invitedSide) : null;
  const timeUntilExpiry = new Date(invitation.expiresAt).getTime() - new Date().getTime();
  const hoursLeft = Math.max(0, Math.floor(timeUntilExpiry / (1000 * 60 * 60)));

  return (
    <View testID={`invitation-card-${invitation.id}`} style={[styles.betCard, styles.invitationCard]}>
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
            <View style={[styles.sideOptions, options.length > 2 && styles.sideOptionsWrap]}>
              {options.map((option, index) => {
                const selected = selectedSide === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    testID={`invitation-side-${option.key.toLowerCase()}`}
                    style={[
                      styles.sideOption,
                      options.length > 2
                        ? styles.sideOptionWrapped
                        : index === options.length - 1 && styles.sideOptionLast,
                      selected && styles.sideOptionSelected
                    ]}
                    onPress={() => setSelectedSide(option.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.sideOptionIndicator,
                      selected && styles.sideOptionIndicatorSelected
                    ]} />
                    <View style={styles.sideOptionContent}>
                      <Text style={[
                        styles.sideOptionText,
                        selected && styles.sideOptionTextSelected
                      ]}>
                        {option.name}
                      </Text>
                      <View style={styles.sideOptionParticipants}>
                        <Ionicons name="people-outline" size={11} color={selected ? colors.background : colors.textMuted} />
                        <Text style={[
                          styles.sideOptionParticipantCount,
                          selected && styles.sideOptionParticipantCountSelected
                        ]}>
                          {optionCount(invitation.bet!, option.key)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.invitationActions}>
        <TouchableOpacity
          testID="invitation-decline"
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
          testID="invitation-accept"
          style={[
            styles.invitationButton,
            styles.acceptButton,
            (!hasSpecificSide && !selectedSide) && styles.acceptButtonDisabled
          ]}
          onPress={() => onAccept(hasSpecificSide ? invitedSide : selectedSide!)}
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
  acceptButton: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: spacing.radius.md,
  },
  acceptButtonDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  acceptButtonText: {
    color: colors.background,
  },
  acceptButtonTextDisabled: {
    color: colors.textMuted,
  },
  betCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineButton: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: spacing.radius.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  declineButtonText: {
    color: colors.error,
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
  invitationActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  invitationAmount: {
    ...textStyles.pot,
    color: colors.warning,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  invitationBetDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  invitationBetDetails: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  invitationBetTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
    marginRight: spacing.sm,
  },
  invitationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  invitationButtonText: {
    ...textStyles.button,
    marginLeft: spacing.xs / 2,
    fontWeight: typography.fontWeight.semibold,
  },
  invitationCard: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primary + '08',
  },
  invitationFromText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  invitationFromUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  invitationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
  invitationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs / 2,
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
  sideOptionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  sideOptionLast: {
    marginRight: 0,
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
  sideOptionParticipants: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  sideOptionSelected: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
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
  sideOptions: {
    flexDirection: 'row',
  },
  // A pool's options stack, one to a row
  sideOptionsWrap: {
    flexDirection: 'column',
  },
  sideOptionWrapped: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    marginRight: 0,
    marginBottom: spacing.xs,
  },
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
});
