/**
 * SideBet Spacing System
 * Consistent spacing scale for layouts and components
 */

export const spacing = {
  // Base spacing units
  0: 0,
  1: 4,    // 0.25rem equivalent
  2: 8,    // 0.5rem
  3: 12,   // 0.75rem
  4: 16,   // 1rem
  5: 20,   // 1.25rem
  6: 24,   // 1.5rem
  7: 28,   // 1.75rem
  8: 32,   // 2rem
  9: 36,   // 2.25rem
  10: 40,  // 2.5rem
  11: 44,  // 2.75rem
  12: 48,  // 3rem
  14: 56,  // 3.5rem
  16: 64,  // 4rem
  20: 80,  // 5rem
  24: 96,  // 6rem
  32: 128, // 8rem
  40: 160, // 10rem
  48: 192, // 12rem
  56: 224, // 14rem
  64: 256, // 16rem
  
  // Semantic spacing (easier to remember)
  xs: 4,    // Extra small spacing
  sm: 8,    // Small spacing
  md: 16,   // Medium spacing (base unit)
  lg: 24,   // Large spacing
  xl: 32,   // Extra large spacing
  '2xl': 48, // 2x extra large
  '3xl': 64, // 3x extra large
  
  // Component-specific spacing
  padding: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  margin: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  
  // Layout spacing
  container: {
    padding: 16,    // Standard container padding
    margin: 20,     // Standard container margin
  },
  
  // Card spacing
  card: {
    padding: 16,    // Standard card inner padding
    margin: 8,      // Space between cards
    gap: 12,        // Gap between card elements
  },
  
  // Header/Navigation spacing
  header: {
    height: 60,     // Standard header height
    padding: 16,    // Header horizontal padding
  },
  navigation: {
    height: 80,     // Bottom tab navigation height (legacy)
    baseHeight: 85, // Bottom tab bar base height (minHeight from TabBar component)
    padding: 12,    // Tab padding
  },
  
  // Form spacing
  form: {
    fieldGap: 16,   // Gap between form fields
    sectionGap: 24, // Gap between form sections
    padding: 20,    // Form container padding
  },
  
  // Button spacing
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,         // Gap between button elements
  },
  
  // Border radius values
  radius: {
    none: 0,
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    full: 9999,     // Fully rounded
  },
  
  // Betting-specific spacing
  betting: {
    cardGap: 12,        // Gap between bet cards
    cardPadding: 16,    // Internal bet card padding
    oddsSpacing: 8,     // Space around odds display
    statusBadgePadding: 6, // Status badge padding
  },
} as const;

// Responsive spacing helpers (for different screen sizes)
export const responsiveSpacing = {
  // Small screens (phones)
  sm: {
    container: 12,
    card: 12,
    section: 16,
  },
  
  // Medium screens (large phones, small tablets)
  md: {
    container: 16,
    card: 16,
    section: 24,
  },
  
  // Large screens (tablets, desktop)
  lg: {
    container: 24,
    card: 20,
    section: 32,
  },
} as const;

export type SpacingKeys = keyof typeof spacing;
export type ResponsiveSpacingKeys = keyof typeof responsiveSpacing;