/**
 * "Bet sent": who was invited, a summary of the bet, and the next bet as the main action.
 * "Close betting now" is here because the creator, watching the game, is the one who
 * knows when a bet should stop taking joins.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { SentSheet } from './SentSheet';
import { createStyles, sheetStyles } from './styles';

interface BetSentPanelProps {
  invitedText: string | null;
  title: string;
  pickName: string;
  stakeText: string;
  closeAt: string;
  againDetail: string;
  againLabel: string;
  onAgain: () => void;
  onShare: (() => void) | null;
  onView: () => void;
  onCloseBetting: () => void;
  closing: boolean;
  closed: boolean;
}

export const BetSentPanel: React.FC<BetSentPanelProps> = ({
  invitedText,
  title,
  pickName,
  stakeText,
  closeAt,
  againDetail,
  againLabel,
  onAgain,
  onShare,
  onView,
  onCloseBetting,
  closing,
  closed,
}) => (
  <SentSheet title="Bet sent" subtitle={invitedText} testID="create-sent">
    <View style={sheetStyles.summary}>
      <Text style={styles.betTitle} numberOfLines={2}>
        {title}
      </Text>
      <View style={styles.summaryRow}>
        <Text testID="create-sent-summary" style={styles.summaryText}>
          You: <Text style={styles.strong}>{pickName}</Text> · <Text style={styles.stake}>{stakeText}</Text>
        </Text>
        <Text style={styles.summaryText}>Closes {closeAt}</Text>
      </View>
    </View>

    <TouchableOpacity testID="create-again" style={sheetStyles.primary} onPress={onAgain} accessibilityRole="button">
      <Text style={sheetStyles.primaryText}>{againLabel}</Text>
      <Text style={sheetStyles.primaryDetail}>{againDetail}</Text>
    </TouchableOpacity>

    <View style={sheetStyles.row}>
      {onShare && (
        <TouchableOpacity testID="create-share" style={sheetStyles.secondary} onPress={onShare} accessibilityRole="button">
          <Text style={sheetStyles.secondaryText}>Share link</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        testID="create-view"
        style={[sheetStyles.secondary, onShare && sheetStyles.secondaryGap]}
        onPress={onView}
        accessibilityRole="button"
      >
        <Text style={sheetStyles.secondaryText}>View bet</Text>
      </TouchableOpacity>
    </View>

    <TouchableOpacity
      testID="create-close-betting"
      style={styles.closeBetting}
      onPress={onCloseBetting}
      disabled={closing || closed}
      accessibilityRole="button"
      accessibilityState={{ disabled: closing || closed }}
    >
      <Text style={createStyles.link}>{closed ? 'Betting closed' : closing ? 'Closing…' : 'Close betting now'}</Text>
    </TouchableOpacity>
  </SentSheet>
);

const styles = StyleSheet.create({
  betTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  summaryText: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
  },
  strong: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  stake: {
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  closeBetting: {
    alignSelf: 'center',
    paddingVertical: spacing.padding.sm,
    marginTop: spacing.xs,
  },
});
