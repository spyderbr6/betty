/**
 * The create button, kept above the tab bar so it never scrolls away. Its second line
 * says who can join, who is invited and when the bet closes.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, shadows, spacing, textStyles, typography } from '../../styles';

interface CreateBarProps {
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
}

export const CreateBar: React.FC<CreateBarProps> = ({ label, detail, onPress, disabled, busy }) => (
  <View style={styles.container}>
    <TouchableOpacity
      testID="create-submit"
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          <Text style={[styles.label, { marginLeft: spacing.sm }]}>Creating…</Text>
        </View>
      ) : (
        <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
      )}
    </TouchableOpacity>
    <Text testID="create-submit-detail" style={styles.detail} numberOfLines={2}>
      {detail}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    ...shadows.header,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.xl,
    paddingVertical: spacing.padding.sm,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceLight,
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    ...textStyles.button,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  labelDisabled: {
    color: colors.textPrimary,
  },
  detail: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
