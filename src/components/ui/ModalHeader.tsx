/**
 * Modal Header Component
 * Standardized header for full-screen modals
 * Ensures consistent UX and prevents modal stacking issues
 *
 * The same screens also appear as pages in the Account tab's stack. There, pass
 * variant="back": a back arrow on the left replaces the close button on the right.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, textStyles, typography } from '../../styles';

export type ModalHeaderVariant = 'close' | 'back';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  rightComponent?: React.ReactNode;
  variant?: ModalHeaderVariant;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  onClose,
  rightComponent,
  variant = 'close',
}) => {
  if (variant === 'back') {
    return (
      <View style={styles.container}>
        <View style={styles.leftGroup}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            testID="header-back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.rightActions}>{rightComponent}</View>
      </View>
    );
  }

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
          testID="modal-close"
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
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
    marginLeft: -spacing.xs,
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
