/**
 * UserBalance Component
 * Standalone component for displaying and managing user balance
 * Ensures consistent balance display across all screens
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, textStyles } from '../../styles';
import { useProfile } from '../../contexts/ProfileContext';
import { formatCurrency } from '../../utils/formatting';

export interface UserBalanceProps {
  onPress?: () => void;
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'compact' | 'header';
  testID?: string;
}

export const UserBalance: React.FC<UserBalanceProps> = ({
  onPress,
  showLabel = true,
  size = 'medium',
  variant = 'default',
  testID,
}) => {
  // One shared, live copy of the balance for every header (ProfileContext). Each header
  // used to read it and open three subscriptions of its own.
  const { balance, isLoading } = useProfile();

  const getStyles = () => {
    switch (variant) {
      case 'compact':
        return {
          container: styles.compactContainer,
          balanceText: [styles.balanceText, styles.balanceTextCompact],
          labelText: [styles.labelText, styles.labelTextCompact],
        };
      case 'header':
        return {
          container: styles.headerContainer,
          balanceText: [styles.balanceText, styles.balanceTextHeader],
          labelText: [styles.labelText, styles.labelTextHeader],
        };
      default:
        return {
          container: styles.container,
          balanceText: [styles.balanceText, getSizeStyle(size)],
          labelText: [styles.labelText, getSizeLabelStyle(size)],
        };
    }
  };

  const getSizeStyle = (size: string) => {
    switch (size) {
      case 'small':
        return styles.balanceTextSmall;
      case 'large':
        return styles.balanceTextLarge;
      default:
        return styles.balanceTextMedium;
    }
  };

  const getSizeLabelStyle = (size: string) => {
    switch (size) {
      case 'small':
        return styles.labelTextSmall;
      case 'large':
        return styles.labelTextLarge;
      default:
        return styles.labelTextMedium;
    }
  };

  const componentStyles = getStyles();

  const content = (
    <View style={componentStyles.container}>
      {showLabel && (
        <Text style={componentStyles.labelText}>BALANCE</Text>
      )}

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={componentStyles.balanceText}>
          {formatCurrency(balance)}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} testID={testID} accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  // Default container
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },

  // Variant containers
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs / 2,
    paddingHorizontal: spacing.xs,
  },
  headerContainer: {
    alignItems: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },

  // Balance text styles
  balanceText: {
    ...textStyles.h3,
    color: colors.primary,
    fontWeight: typography.fontWeight.bold,
  },
  balanceTextSmall: {
    fontSize: typography.fontSize.sm,
  },
  balanceTextMedium: {
    fontSize: typography.fontSize.lg,
  },
  balanceTextLarge: {
    fontSize: typography.fontSize.xl,
  },
  balanceTextCompact: {
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.xs,
  },
  balanceTextHeader: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },

  // Label text styles
  labelText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
  },
  labelTextSmall: {
    fontSize: 8,
  },
  labelTextMedium: {
    fontSize: typography.fontSize.xs,
  },
  labelTextLarge: {
    fontSize: typography.fontSize.sm,
  },
  labelTextCompact: {
    fontSize: 8,
    marginRight: spacing.xs,
  },
  labelTextHeader: {
    fontSize: 9,
    marginBottom: 2,
  },
});