/**
 * SideBet Typography System
 * Professional typography scale for sportsbook interface
 */

import { Platform } from 'react-native';

export const typography = {
  // Font families
  fontFamily: {
    regular: Platform.select({
      ios: 'System',
      android: 'Roboto',
      default: 'System',
    }),
    mono: Platform.select({
      ios: 'Courier New',
      android: 'monospace', 
      default: 'Courier New',
    }), // For odds display
    bold: Platform.select({
      ios: 'System',
      android: 'Roboto',
      default: 'System',
    }),
  },
  
  // Font sizes (responsive scale)
  fontSize: {
    xs: 12,     // Small labels, captions
    sm: 14,     // Body text small, secondary info
    base: 16,   // Default body text
    lg: 18,     // Larger body text, small headings
    xl: 20,     // Card titles, medium headings
    '2xl': 24,  // Section headers
    '3xl': 30,  // Page titles
    '4xl': 36,  // Large display text
    '5xl': 48,  // Hero text
    
    // Betting-specific sizes
    odds: 18,       // Odds display (-110, +150)
    amount: 20,     // Bet amounts ($50, $200)
    balance: 24,    // Account balance display
    pot: 22,        // Total pot display
  },
  
  // Font weights
  fontWeight: {
    thin: '100' as const,
    light: '200' as const,
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },
  
  // Line heights (relative to font size)
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },
  
  // Letter spacing
  letterSpacing: {
    tighter: -0.8,
    tight: -0.4,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.6,
  },
} as const;

// Typography presets for common UI patterns
export const textStyles = {
  // Headers
  h1: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
    lineHeight: typography.lineHeight.tight,
    letterSpacing: typography.letterSpacing.tight,
  },
  h2: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.bold,
    lineHeight: typography.lineHeight.tight,
  },
  h3: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.snug,
  },
  h4: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.snug,
  },
  
  // Body text
  body: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.normal,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.normal,
  },
  bodyLarge: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.normal,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.normal,
  },
  bodySmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.normal,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.normal,
  },
  
  // Captions and labels
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.normal,
    letterSpacing: typography.letterSpacing.wide,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.normal,
    letterSpacing: typography.letterSpacing.wide,
  },
  
  // Betting-specific text styles
  odds: {
    fontSize: typography.fontSize.odds,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.mono,
    lineHeight: typography.lineHeight.none,
  },
  amount: {
    fontSize: typography.fontSize.amount,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  balance: {
    fontSize: typography.fontSize.balance,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  pot: {
    fontSize: typography.fontSize.pot,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  
  // Status text
  status: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
    letterSpacing: typography.letterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
  
  // Buttons
  button: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  buttonSmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  buttonLarge: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  
  // Navigation
  tabLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.regular,
    lineHeight: typography.lineHeight.none,
  },
  
  // Special displays
  hero: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.black,
    fontFamily: typography.fontFamily.bold,
    lineHeight: typography.lineHeight.tight,
    letterSpacing: typography.letterSpacing.tight,
  },
} as const;

export type TypographyKeys = keyof typeof typography;
export type TextStyleKeys = keyof typeof textStyles;