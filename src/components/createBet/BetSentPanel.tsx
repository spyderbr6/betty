/**
 * Shown in place of the form once a bet is created: who was invited, your side, and the
 * next bet as the main action. "Close betting" is here because the creator, watching the
 * game, is the one who knows when a bet should stop taking joins.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';

interface BetSentPanelProps {
  invitedText: string | null;
  summary: string;
  againDetail: string;
  againLabel: string;
  onAgain: () => void;
  onShare: (() => void) | null;
  onView: () => void;
  onCloseBetting: () => void;
  closing: boolean;
  closed: boolean;
  /** "1 open bet on this game", or null */
  openOnGame: string | null;
  onOpenOnGame: () => void;
}

export const BetSentPanel: React.FC<BetSentPanelProps> = ({
  invitedText,
  summary,
  againDetail,
  againLabel,
  onAgain,
  onShare,
  onView,
  onCloseBetting,
  closing,
  closed,
  openOnGame,
  onOpenOnGame,
}) => (
  <View style={styles.container} testID="create-sent">
    <View style={styles.check}>
      <Text style={styles.checkText}>✓</Text>
    </View>
    <Text style={styles.title} accessibilityRole="header">Bet sent</Text>
    {invitedText && <Text style={styles.invited}>{invitedText}</Text>}
    <Text testID="create-sent-summary" style={styles.summary}>{summary}</Text>

    <TouchableOpacity testID="create-again" style={styles.primary} onPress={onAgain} accessibilityRole="button">
      <Text style={styles.primaryText}>{againLabel}</Text>
      <Text style={styles.primaryDetail}>{againDetail}</Text>
    </TouchableOpacity>

    <View style={styles.actions}>
      {onShare && (
        <TouchableOpacity testID="create-share" style={[styles.secondary, styles.half]} onPress={onShare} accessibilityRole="button">
          <Text style={styles.secondaryText}>Share link</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity testID="create-view" style={[styles.secondary, styles.half]} onPress={onView} accessibilityRole="button">
        <Text style={styles.secondaryText}>View bet</Text>
      </TouchableOpacity>
    </View>
    <TouchableOpacity
      testID="create-close-betting"
      style={[styles.secondary, styles.closeBetting]}
      onPress={onCloseBetting}
      disabled={closing || closed}
      accessibilityRole="button"
      accessibilityState={{ disabled: closing || closed }}
    >
      <Text style={styles.secondaryText}>{closed ? 'Betting closed' : closing ? 'Closing…' : 'Close betting now'}</Text>
    </TouchableOpacity>

    {openOnGame && (
      <TouchableOpacity testID="create-open-on-game" onPress={onOpenOnGame} accessibilityRole="button" style={styles.openOnGame}>
        <Text style={styles.openOnGameText}>{openOnGame} · View ›</Text>
      </TouchableOpacity>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    alignItems: 'stretch',
  },
  check: {
    alignSelf: 'center',
    width: spacing[14],
    height: spacing[14],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    ...textStyles.h2,
    color: colors.textInverse,
  },
  title: {
    ...textStyles.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  invited: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  summary: {
    ...textStyles.label,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.xl,
    paddingVertical: spacing.padding.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  primaryText: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  primaryDetail: {
    ...textStyles.caption,
    color: colors.textInverse,
    marginTop: spacing.xs / 2,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginHorizontal: -spacing.xs,
  },
  secondary: {
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.padding.sm,
    alignItems: 'center',
    marginHorizontal: spacing.xs,
  },
  half: {
    flex: 1,
  },
  closeBetting: {
    marginHorizontal: 0,
    marginTop: spacing.sm,
  },
  secondaryText: {
    ...textStyles.label,
    color: colors.textPrimary,
  },
  openOnGame: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  openOnGameText: {
    ...textStyles.label,
    color: colors.primary,
  },
});
