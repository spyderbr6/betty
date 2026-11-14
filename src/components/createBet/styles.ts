/**
 * Styles shared by the Create Bet pieces. Yellow is kept for your side and the create
 * button; other selected states are grey, as the design asks.
 */

import { StyleSheet } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';

export const createStyles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
  },
  link: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.xs + spacing.xs / 2,
    borderRadius: spacing.radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.textSecondary,
  },
  chipText: {
    ...textStyles.label,
    color: colors.textPrimary,
  },
  tile: {
    flex: 1,
    minHeight: spacing[20],
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.padding.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tileName: {
    ...textStyles.h4,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tileNameSelected: {
    color: colors.textInverse,
  },
  tileHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  tileHintSelected: {
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  tileInput: {
    ...textStyles.h4,
    color: colors.textPrimary,
    textAlign: 'center',
    textAlignVertical: 'center',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.xs,
  },
});
