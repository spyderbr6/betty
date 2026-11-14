/**
 * Create's own title bar, as the design draws it: "New bet" (or "‹ Squares" with a back
 * arrow) and the balance in a pill. Replaces the app header on this tab.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import { useProfile } from '../../contexts/ProfileContext';
import { TARGET } from './styles';

interface CreateHeaderProps {
  title: string;
  /** Shows the back arrow */
  onBack?: () => void;
  backTestID?: string;
}

export const CreateHeader: React.FC<CreateHeaderProps> = ({ title, onBack, backTestID }) => {
  const { balance, isLoading } = useProfile();
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {onBack && (
          <TouchableOpacity
            testID={backTestID}
            onPress={onBack}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.balance} testID="create-balance">
        <Text style={styles.balanceText}>{isLoading ? '…' : `$${balance.toFixed(2)}`}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: {
    width: spacing[9],
    height: TARGET,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  backText: {
    fontSize: typography.fontSize['3xl'],
    color: colors.textSecondary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  title: {
    ...textStyles.h3,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  balance: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.lg,
    paddingHorizontal: spacing.padding.xs + spacing.xs / 2,
    paddingVertical: spacing.xs + spacing.xs / 2,
  },
  balanceText: {
    ...textStyles.label,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.normal,
  },
});
