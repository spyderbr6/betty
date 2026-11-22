/**
 * The blue ✦ on a field filled from the typed bet ("Create Bet Type It" design): "✦" next
 * to a label, "✦ From your text" where there is room, "✦ guess" when it is only a guess.
 * Yellow stays for your pick and the create button.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../styles';
import { createStyles } from './styles';

export type FillMarkKind = 'filled' | 'guess' | null | undefined;

interface FillMarkProps {
  kind: FillMarkKind;
  /** "✦ From your text" instead of "✦" */
  long?: boolean;
  testID?: string;
}

export const FillMark: React.FC<FillMarkProps> = ({ kind, long, testID }) => {
  if (!kind) return null;
  const text = kind === 'guess' ? '✦ guess' : long ? '✦ From your text' : '✦';
  return (
    <Text testID={testID} style={styles.mark} accessibilityLabel={kind === 'guess' ? 'Guessed from your text' : 'Filled from your text'}>
      {text}
    </Text>
  );
};

/** A section label with its mark beside it. */
export const MarkedLabel: React.FC<{ label: string; kind: FillMarkKind; long?: boolean; testID?: string }> = ({
  label,
  kind,
  long,
  testID,
}) => (
  <View style={styles.row}>
    <Text style={createStyles.label}>{label}</Text>
    <FillMark kind={kind} long={long} testID={testID} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  mark: {
    ...createStyles.label,
    color: colors.filled,
    textTransform: 'none',
    marginLeft: spacing.sm,
  },
});
