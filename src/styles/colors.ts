/**
 * SideBet Color System
 * Professional sportsbook color palette based on mockup design
 */

export const colors = {
  // Main theme (professional sportsbook dark)
  background: '#111827',    // gray-900 - Main app background
  surface: '#1F2937',       // gray-800 - Card backgrounds
  surfaceLight: '#374151',  // gray-700 - Lighter surfaces
  surfaceElevated: '#4B5563', // gray-600 - Elevated surfaces
  
  // Borders and dividers
  border: '#4B5563',        // gray-600 - Primary borders
  borderLight: '#6B7280',   // gray-500 - Lighter borders
  borderSubtle: '#374151',  // gray-700 - Subtle borders
  
  // Text colors
  textPrimary: '#FFFFFF',   // Pure white - Primary text
  textSecondary: '#D1D5DB', // gray-300 - Secondary text
  textMuted: '#9CA3AF',     // gray-400 - Muted text
  textInverse: '#111827',   // Dark text on light backgrounds
  
  // Brand colors (SideBet yellow)
  primary: '#EAB308',       // yellow-500 - Primary brand color
  primaryLight: '#FDE047',  // yellow-300 - Lighter brand
  primaryDark: '#CA8A04',   // yellow-600 - Darker brand
  primaryMuted: '#FEF3C7',  // yellow-100 - Very light brand
  
  // Status colors
  success: '#10B981',       // green-500 - Success states
  successLight: '#D1FAE5', // green-100 - Light success background
  successDark: '#047857',   // green-700 - Dark success
  
  error: '#EF4444',         // red-500 - Error states
  errorLight: '#FEE2E2',   // red-100 - Light error background
  errorDark: '#DC2626',     // red-600 - Dark error
  
  warning: '#F59E0B',       // amber-500 - Warning states
  warningLight: '#FEF3C7', // amber-100 - Light warning background
  warningDark: '#D97706',   // amber-600 - Dark warning
  
  info: '#3B82F6',          // blue-500 - Info states
  infoLight: '#DBEAFE',    // blue-100 - Light info background
  infoDark: '#2563EB',      // blue-600 - Dark info
  
  // Live betting colors
  live: '#DC2626',          // red-600 - Live indicator
  liveBackground: '#7F1D1D', // red-900 - Live background
  livePulse: '#EF4444',     // red-500 - Live pulse animation
  
  // Betting status colors
  active: '#10B981',        // green-500 - Active bets
  pending: '#F59E0B',       // amber-500 - Pending resolution
  resolved: '#6B7280',      // gray-500 - Resolved bets
  cancelled: '#9CA3AF',     // gray-400 - Cancelled bets
  
  // Odds colors (American format)
  oddsPositive: '#10B981',  // green-500 - Positive odds (+150)
  oddsNegative: '#EF4444',  // red-500 - Negative odds (-110)
  
  // Interactive states
  hover: '#374151',         // gray-700 - Hover states
  pressed: '#4B5563',       // gray-600 - Pressed states
  focus: '#EAB308',         // yellow-500 - Focus outlines
  disabled: '#6B7280',      // gray-500 - Disabled elements
  
  // Gradients (for special elements)
  gradientStart: '#111827', // Dark gradient start
  gradientEnd: '#1F2937',   // Dark gradient end
  
  // Overlay colors
  overlay: 'rgba(0, 0, 0, 0.8)',        // Modal overlays
  overlayLight: 'rgba(0, 0, 0, 0.4)',   // Light overlays
  
  // Shadow colors
  shadow: 'rgba(0, 0, 0, 0.25)',        // Standard shadows
  shadowHeavy: 'rgba(0, 0, 0, 0.5)',    // Heavy shadows
} as const;

// Color semantic mapping for better component usage
export const semantic = {
  // Background colors
  background: {
    primary: colors.background,
    secondary: colors.surface,
    elevated: colors.surfaceLight,
  },
  
  // Text colors
  text: {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    inverse: colors.textInverse,
  },
  
  // Interactive colors
  interactive: {
    default: colors.primary,
    hover: colors.primaryDark,
    pressed: colors.primaryDark,
    disabled: colors.disabled,
  },
  
  // Status colors
  status: {
    live: colors.live,
    active: colors.active,
    pending: colors.pending,
    resolved: colors.resolved,
    cancelled: colors.cancelled,
  },
} as const;

export type ColorKeys = keyof typeof colors;
export type SemanticColorKeys = keyof typeof semantic;