/**
 * The kind of bet: two sides, a pool, a one-on-one challenge, or squares (its own form).
 * The selected tab is grey: yellow is for your side and the create button only.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';
import type { BetFormat } from '../../services/createBetFlowLogic';

interface FormatTabsProps {
  value: BetFormat;
  onChange: (format: BetFormat) => void;
  onSquares: () => void;
}

const TABS: { id: BetFormat | 'squares'; label: string }[] = [
  { id: 'sides', label: '2 sides' },
  { id: 'pool', label: 'Pool' },
  { id: 'challenge', label: '1 v 1' },
  { id: 'squares', label: 'Squares ↗' },
];

export const FormatTabs: React.FC<FormatTabsProps> = ({ value, onChange, onSquares }) => (
  <View style={styles.container} accessibilityRole="tablist">
    {TABS.map((tab) => {
      const selected = tab.id === value;
      return (
        <TouchableOpacity
          key={tab.id}
          testID={`create-format-${tab.id}`}
          style={[styles.tab, selected && styles.tabSelected]}
          onPress={() => (tab.id === 'squares' ? onSquares() : onChange(tab.id))}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
        >
          <Text style={[styles.text, selected && styles.textSelected]}>{tab.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.md,
    alignItems: 'center',
  },
  tabSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  text: {
    ...textStyles.label,
    color: colors.textSecondary,
  },
  textSelected: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
});
