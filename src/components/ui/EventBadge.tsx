/**
 * EventBadge Component
 *
 * Displays a sport icon with check-in count for live events
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../../styles';
import type { SportType } from '../../types/events';

export interface EventBadgeProps {
  sport: SportType;
  checkInCount: number;
  size?: 'small' | 'medium' | 'large';
  showCount?: boolean;
}

const SPORT_ICONS: Record<SportType, string> = {
  NBA: '🏀',
  NFL: '🏈',
  MLB: '⚾',
  NHL: '🏒',
  SOCCER: '⚽',
  COLLEGE_FOOTBALL: '🏈',
  COLLEGE_BASKETBALL: '🏀',
  OTHER: '🏆',
};

const SPORT_NAMES: Record<SportType, string> = {
  NBA: 'NBA',
  NFL: 'NFL',
  MLB: 'MLB',
  NHL: 'NHL',
  SOCCER: 'Soccer',
  COLLEGE_FOOTBALL: 'CFB',
  COLLEGE_BASKETBALL: 'CBB',
  OTHER: 'Live',
};

export const EventBadge: React.FC<EventBadgeProps> = ({
  sport,
  checkInCount,
  size = 'medium',
  showCount = true,
}) => {
  const icon = SPORT_ICONS[sport];
  const sportName = SPORT_NAMES[sport];

  return (
    <View style={[styles.container, styles[`container_${size}`]]}>
      <View style={[styles.iconContainer, styles[`iconContainer_${size}`]]}>
        <Text style={[styles.icon, styles[`icon_${size}`]]}>
          {icon}
        </Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.sportName, styles[`sportName_${size}`]]}>
          {sportName}
        </Text>
        {showCount && (
          <Text style={[styles.checkInCount, styles[`checkInCount_${size}`]]}>
            {checkInCount} {checkInCount === 1 ? 'person' : 'people'}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  container_small: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
  },
  container_medium: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  container_large: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconContainer: {
    marginRight: spacing.xs,
  },
  iconContainer_small: {
    marginRight: spacing.xs / 2,
  },
  iconContainer_medium: {
    marginRight: spacing.xs,
  },
  iconContainer_large: {
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: 16,
  },
  icon_small: {
    fontSize: 12,
  },
  icon_medium: {
    fontSize: 16,
  },
  icon_large: {
    fontSize: 20,
  },
  textContainer: {
    flexDirection: 'column',
  },
  sportName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
  },
  sportName_small: {
    fontSize: typography.fontSize.xs,
  },
  sportName_medium: {
    fontSize: typography.fontSize.sm,
  },
  sportName_large: {
    fontSize: typography.fontSize.base,
  },
  checkInCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  checkInCount_small: {
    fontSize: 10,
  },
  checkInCount_medium: {
    fontSize: typography.fontSize.xs,
  },
  checkInCount_large: {
    fontSize: typography.fontSize.sm,
  },
});
