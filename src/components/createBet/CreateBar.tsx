/**
 * The create button, kept above the tab bar so it never scrolls away. It spells the bet
 * out on its first line ("Create · $5 on Yes") and who can join, who is invited and when
 * it closes on its second. Grey until there is a pick.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';

interface CreateBarProps {
  label: string;
  detail: string;
  onPress: () => void;
  onPressIn?: () => void;
  disabled: boolean;
  busy: boolean;
}

export const CreateBar: React.FC<CreateBarProps> = ({ label, detail, onPress, onPressIn, disabled, busy }) => (
  <View style={styles.container}>
    <TouchableOpacity
      testID="create-submit"
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      onPressIn={onPressIn}
      disabled={disabled || busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={[styles.label, styles.busyLabel]}>Creating…</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.label, disabled && styles.labelDisabled]} numberOfLines={1}>
            {label}
          </Text>
          {!!detail && (
            <Text testID="create-submit-detail" style={[styles.detail, disabled && styles.detailDisabled]} numberOfLines={2}>
              {/* A no-break space keeps "6:20 PM" on one line when the detail wraps */}
              {detail.replace(/ (AM|PM)/g, ' $1')}
            </Text>
          )}
        </>
      )}
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.padding.sm,
  },
  button: {
    minHeight: spacing[14],
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busyLabel: {
    marginLeft: spacing.sm,
  },
  label: {
    ...textStyles.body,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  labelDisabled: {
    color: colors.textPrimary,
  },
  detail: {
    ...textStyles.caption,
    color: colors.textInverse,
    marginTop: spacing.xs / 2,
    textAlign: 'center',
  },
  detailDisabled: {
    color: colors.textSecondary,
  },
});
