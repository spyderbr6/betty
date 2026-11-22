/**
 * "We heard": what the typed bet filled in, shown under the question while it is being
 * typed, with the create button, so the bet can be checked and sent without closing the
 * keyboard ("Create Bet Type It" design, step 2).
 *
 * The design docks it above the keyboard. It sits under the question instead: the
 * question is at the top of the screen, so it stays in view with the keyboard up, and
 * nothing has to follow the keyboard's height on iOS and Android.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { formatStake, type BetFormat } from '../../services/createBetFlowLogic';
import { CreateBar } from './CreateBar';
import { createStyles } from './styles';

interface WeHeardPanelProps {
  format: BetFormat;
  /** Two side names, or a pool's options */
  options: string[];
  pickedIndex: number | null;
  /** A 1 v 1's opponent, first name */
  opponentName: string | null;
  stake: number;
  closeLabel: string;
  /** The sides are a guess (money on a bare statement) */
  sidesGuess: boolean;
  /** The closing time is a guess ("next score" read as 15 min) */
  closeGuess: boolean;
  createLabel: string;
  createDetail: string;
  onCreate: () => void;
  createDisabled: boolean;
  busy: boolean;
}

const FORMAT_NAMES: Record<BetFormat, string> = { sides: '2 sides', pool: 'Pool', challenge: '1 v 1' };

const Cell: React.FC<{ label: string; value: string; testID: string; guess?: boolean }> = ({ label, value, testID, guess }) => (
  <View style={styles.cell}>
    <Text style={createStyles.label}>{label}</Text>
    <Text testID={testID} style={[styles.value, guess && styles.guess]} numberOfLines={1}>
      {value}
      {guess ? ' ?' : ''}
    </Text>
  </View>
);

export const WeHeardPanel: React.FC<WeHeardPanelProps> = ({
  format,
  options,
  pickedIndex,
  opponentName,
  stake,
  closeLabel,
  sidesGuess,
  closeGuess,
  createLabel,
  createDetail,
  onCreate,
  createDisabled,
  busy,
}) => {
  const names = options.map((name) => name.trim()).filter(Boolean);
  const mine = pickedIndex === null ? null : names[pickedIndex] ?? null;
  const others = format === 'pool' ? null : names.filter((_, i) => i !== pickedIndex).join(' / ');
  const side =
    format === 'pool'
      ? mine ?? `${names.length} options`
      : mine
        ? `${mine} vs ${others}`
        : names.join(' / ');
  const unclear =
    pickedIndex === null && names.length > 0
      ? format === 'pool'
        ? 'Your pick wasn’t clear. Tap it below.'
        : `Your side wasn’t clear. Tap ${names[0]} or ${names[1] ?? 'the other'}.`
      : null;

  return (
    <View style={createStyles.block}>
      <View testID="create-heard" style={styles.panel}>
        <Text style={styles.heading}>✦ We heard</Text>
        <View style={styles.grid}>
          <Cell
            label="Format"
            value={format === 'challenge' && opponentName ? `1 v 1 · ${opponentName}` : FORMAT_NAMES[format]}
            testID="create-heard-format"
          />
          <Cell label={mine ? 'You' : 'Sides'} value={side} testID="create-heard-side" guess={sidesGuess} />
          <Cell label="Stake" value={formatStake(stake)} testID="create-heard-stake" />
          <Cell label="Closes" value={closeLabel} testID="create-heard-close" guess={closeGuess} />
        </View>
        {unclear && (
          <Text testID="create-heard-unclear" style={styles.unclear}>
            {unclear}
          </Text>
        )}
      </View>
      <View style={styles.button}>
        <CreateBar label={createLabel} detail={createDetail} onPress={onCreate} disabled={createDisabled} busy={busy} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.filled,
    backgroundColor: colors.filledTint,
    borderRadius: spacing.radius.xl,
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.padding.sm,
  },
  heading: {
    ...createStyles.label,
    color: colors.filled,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
  },
  cell: {
    width: '50%',
    paddingRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  value: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    marginTop: spacing.xs / 2,
  },
  guess: {
    color: colors.filled,
  },
  unclear: {
    ...textStyles.bodySmall,
    color: colors.textPrimary,
  },
  // The bar brings its own gutter and border; inside the panel's block it needs neither
  button: {
    marginTop: spacing.sm,
    marginHorizontal: -spacing.md,
  },
});
