/**
 * SideBet Design System
 * Professional sportsbook design system exports
 */

export { colors, semantic } from './colors';
export { typography, textStyles } from './typography';
export { spacing, responsiveSpacing } from './spacing';
export { shadows, innerShadows } from './shadows';

// Re-export types
export type { ColorKeys, SemanticColorKeys } from './colors';
export type { TypographyKeys, TextStyleKeys } from './typography';
export type { SpacingKeys, ResponsiveSpacingKeys } from './spacing';
export type { ShadowKeys, InnerShadowKeys } from './shadows';

// Common style combinations for frequently used patterns
export const commonStyles = {
  // Flex layouts
  flexCenter: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  flexBetween: {
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  flexStart: {
    justifyContent: 'flex-start' as const,
    alignItems: 'center' as const,
  },
  flexEnd: {
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  
  // Common borders
  border: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  
  // Common backgrounds
  backgroundPrimary: {
    backgroundColor: colors.background,
  },
  backgroundSecondary: {
    backgroundColor: colors.surface,
  },
  backgroundCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    ...shadows.card,
  },
  
  // Screen container
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Safe area
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.card.padding,
    marginVertical: spacing.card.margin,
    ...shadows.card,
  },
  
  // Betting-specific styles
  betCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.betting.cardPadding,
    marginVertical: spacing.betting.cardGap,
    ...shadows.betCard,
  },
  
  liveBetCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.betting.cardPadding,
    marginVertical: spacing.betting.cardGap,
    borderLeftWidth: 4,
    borderLeftColor: colors.live,
    ...shadows.liveBetCard,
  },
  
  // Status badges
  statusBadge: {
    paddingHorizontal: spacing.betting.statusBadgePadding,
    paddingVertical: spacing.betting.statusBadgePadding / 2,
    borderRadius: spacing.radius.sm,
    alignSelf: 'flex-start' as const,
  },
  
  // Buttons
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.button.paddingHorizontal,
    paddingVertical: spacing.button.paddingVertical,
    ...shadows.button,
  },
  
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.button.paddingHorizontal,
    paddingVertical: spacing.button.paddingVertical,
    borderWidth: 1,
    borderColor: colors.border,
  },
  
  // Text input
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.padding.md,
    paddingVertical: spacing.padding.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: typography.fontSize.base,
  },
  
  // Navigation styles
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: spacing.navigation.height,
    paddingBottom: spacing.padding.sm,
  },
  
  // Header styles
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    height: spacing.header.height,
    paddingHorizontal: spacing.header.padding,
    ...shadows.header,
  },
} as const;