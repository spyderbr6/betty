/**
 * The confirmation after creating, as the design draws it: a sheet rising over the dimmed
 * form. It is an overlay inside the screen, not a Modal (MODAL_STANDARDS.md keeps Modals
 * full-screen); the form behind stays put for "Another bet".
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';

interface SentSheetProps {
  title: string;
  subtitle: string | null;
  children: React.ReactNode;
  testID: string;
}

export const SentSheet: React.FC<SentSheetProps> = ({ title, subtitle, children, testID }) => (
  <View style={styles.backdrop} testID={testID}>
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.handle} />
      <View style={styles.head}>
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  </View>
);


const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing.radius['3xl'],
    borderTopRightRadius: spacing.radius['3xl'],
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: spacing[10],
    height: spacing.xs,
    borderRadius: spacing.radius.full,
    backgroundColor: colors.surfaceElevated,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    width: spacing[11],
    height: spacing[11],
    borderRadius: spacing.radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.padding.sm,
  },
  checkText: {
    ...textStyles.h3,
    color: colors.textInverse,
  },
  headText: {
    flex: 1,
  },
  title: {
    ...textStyles.h4,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyles.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
});
