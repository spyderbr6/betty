/**
 * Styles shared by the Create Bet pieces, measured from the "Create Bet Final" design:
 * 16px gutters, 16px between blocks, cards with a 12px radius and a 1px border, 44px
 * targets. Yellow is kept for your pick, a selected suggestion and the create button;
 * other selected states are grey.
 */

import { StyleSheet } from 'react-native';
import { colors, spacing, textStyles, typography } from '../../styles';

/** The design's 44px touch target and 72px side tile, from the spacing scale. */
export const TARGET = spacing[11];

export const createStyles = StyleSheet.create({
  block: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: typography.letterSpacing.wider,
    textTransform: 'uppercase',
  },
  link: {
    ...textStyles.label,
    color: colors.textSecondary,
    letterSpacing: typography.letterSpacing.normal,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.xl,
    paddingHorizontal: spacing.padding.sm,
    paddingVertical: spacing.padding.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    height: TARGET,
    paddingHorizontal: spacing.padding.sm,
    borderRadius: spacing.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: typography.letterSpacing.normal,
  },
  chipTextSelected: {
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  /** A picked option: yellow border on a yellow tint */
  picked: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.xl,
    padding: spacing.xs,
  },
  segmentItem: {
    flex: 1,
    height: spacing[9],
    borderRadius: spacing.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs / 2,
  },
  segmentItemActive: {
    backgroundColor: colors.surfaceLight,
  },
  segmentText: {
    ...textStyles.label,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: typography.letterSpacing.normal,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  stepButton: {
    width: TARGET,
    height: TARGET,
    borderRadius: spacing.radius.lg,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    fontSize: typography.fontSize.xl,
    color: colors.textPrimary,
    includeFontPadding: false,
  },
});

/** The confirmation sheets' summary card and buttons (SentSheet). */
export const sheetStyles = StyleSheet.create({
  summary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.xl,
    padding: spacing.padding.sm,
    marginTop: spacing.md,
  },
  primary: {
    minHeight: spacing[14],
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  primaryText: {
    ...textStyles.body,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  primaryDetail: {
    ...textStyles.caption,
    color: colors.textInverse,
    marginTop: spacing.xs / 2,
  },
  row: {
    flexDirection: 'row',
    marginTop: spacing.padding.sm,
  },
  secondary: {
    flex: 1,
    height: spacing[11],
    borderRadius: spacing.radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryGap: {
    marginLeft: spacing.sm,
  },
  secondaryText: {
    ...textStyles.label,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: typography.letterSpacing.normal,
  },
});
