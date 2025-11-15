/**
 * LiveGameBanner Component
 * Interactive banner for event check-ins with two states:
 * 1. Not Checked In - Prompt to check in to nearby events
 * 2. Checked In - Shows checked-in event with details and check-out option
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, textStyles } from '../../styles';
import type { LiveEvent } from '../../types/events';

export interface LiveGameData {
  homeTeam: string;
  awayTeam: string;
  venue: string;
  liveBetsCount: number;
}

export interface LiveGameBannerProps {
  // Checked-in event (if user is checked in)
  checkedInEvent?: LiveEvent | null;
  // Total count of nearby live events (for not-checked-in state)
  nearbyEventsCount?: number;
  // Callbacks
  onCheckInPress?: () => void;  // Opens event discovery modal
  onCheckOutPress?: () => void; // Checks out of current event
  onBannerPress?: () => void;   // Additional tap handler (optional)
}

export const LiveGameBanner: React.FC<LiveGameBannerProps> = ({
  checkedInEvent,
  nearbyEventsCount = 0,
  onCheckInPress,
  onCheckOutPress,
  onBannerPress,
}) => {
  // NOT CHECKED IN STATE
  if (!checkedInEvent) {
    return (
      <TouchableOpacity
        style={styles.notCheckedInContainer}
        onPress={onCheckInPress}
        activeOpacity={0.7}
      >
        <View style={styles.notCheckedInContent}>
          <View style={styles.notCheckedInLeft}>
            <Ionicons name="location-outline" size={16} color={colors.primary} />
            <Text style={styles.notCheckedInText}>
              Check in to nearby event
            </Text>
          </View>
          {nearbyEventsCount > 0 && (
            <Text style={styles.nearbyCount}>
              {nearbyEventsCount} live
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // CHECKED IN STATE
  const handleBannerPress = () => {
    if (onBannerPress) {
      onBannerPress();
    } else if (onCheckInPress) {
      // Default: open event discovery to change venue
      onCheckInPress();
    }
  };

  const handleCheckOutPress = (e: any) => {
    e.stopPropagation();
    if (onCheckOutPress) {
      onCheckOutPress();
    }
  };

  return (
    <TouchableOpacity
      style={styles.checkedInContainer}
      onPress={handleBannerPress}
      activeOpacity={0.7}
    >
      <View style={styles.checkedInContent}>
        <View style={styles.checkedInLeft}>
          <Ionicons name="location" size={20} color={colors.primary} />
          <View style={styles.eventInfo}>
            <Text style={styles.eventName} numberOfLines={1}>
              {checkedInEvent.homeTeam}{' '}
              <Text style={styles.teamBadge}>H</Text>
              {' vs '}
              {checkedInEvent.awayTeam}{' '}
              <Text style={styles.teamBadge}>A</Text>
            </Text>
          </View>
        </View>

        <View style={styles.checkedInRight}>
          {checkedInEvent.betCount > 0 && (
            <Text style={styles.betCount}>
              {checkedInEvent.betCount} {checkedInEvent.betCount === 1 ? 'bet' : 'bets'}
            </Text>
          )}
          <TouchableOpacity
            onPress={handleCheckOutPress}
            style={styles.checkOutButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // NOT CHECKED IN STATE
  notCheckedInContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  notCheckedInContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notCheckedInLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notCheckedInText: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginLeft: spacing.sm,
  },
  nearbyCount: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
  },

  // CHECKED IN STATE
  checkedInContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  checkedInContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkedInLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  eventInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  eventName: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  teamBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs / 2,
    paddingVertical: 1,
    borderRadius: spacing.radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  checkedInRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  betCount: {
    ...textStyles.caption,
    color: colors.primary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginRight: spacing.sm,
  },
  checkOutButton: {
    padding: spacing.xs / 2,
  },
});