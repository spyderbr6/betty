/**
 * Modal Header Component
 * Standardized header for full-screen modals
 * Ensures consistent UX and prevents modal stacking issues
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../../styles';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  rightComponent?: React.ReactNode;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  onClose,
  rightComponent,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rightActions}>
        {rightComponent}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          activeOpacity={0.7}
          accessibilityLabel="Close modal"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 60,
  },
  title: {
    ...textStyles.h3,
    color: colors.textPrimary, // #FFFFFF - Maximum contrast for modal titles
    fontWeight: typography.fontWeight.semibold,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
