/**
 * SideBet Shadow System
 * Professional shadow system for depth and elevation
 */

export const shadows = {
  // No shadow
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0, // Android
  },
  
  // Light shadows
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  
  // Default shadow
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    elevation: 4,
  },
  
  // Medium shadow
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
  
  // Large shadow
  xl: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.37,
    shadowRadius: 7.49,
    elevation: 12,
  },
  
  // Extra large shadow
  '2xl': {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.51,
    shadowRadius: 13.16,
    elevation: 20,
  },
  
  // Component-specific shadows
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
    elevation: 5,
  },
  
  modal: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.65,
    shadowRadius: 15.00,
    elevation: 24,
  },
  
  button: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 2.00,
    elevation: 3,
  },
  
  header: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2.00,
    elevation: 2,
  },
  
  // Special betting interface shadows
  betCard: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.20,
    shadowRadius: 4.00,
    elevation: 6,
  },
  
  liveBetCard: {
    shadowColor: '#DC2626', // Red glow for live bets
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6.00,
    elevation: 8,
  },
  
  // Floating action button
  fab: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.44,
    shadowRadius: 10.32,
    elevation: 16,
  },
} as const;

// Inner shadows (for pressed states, inputs)
export const innerShadows = {
  sm: {
    // Simulated with border and background change
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  md: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  lg: {
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.2)',
  },
} as const;

export type ShadowKeys = keyof typeof shadows;
export type InnerShadowKeys = keyof typeof innerShadows;