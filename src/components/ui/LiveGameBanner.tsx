/**
 * LiveGameBanner Component
 * Standalone component for displaying live game information
 * Can be used in headers or anywhere live game data needs to be shown
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, typography, spacing, textStyles } from '../../styles';

export interface LiveGameData {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  quarter: string;
  timeLeft: string;
  venue: string;
  liveBetsCount: number;
}

export interface LiveGameBannerProps {
  liveGame: LiveGameData;
  onPress?: () => void;
  variant?: 'default' | 'compact' | 'minimal';
  showBetsCount?: boolean;
  showVenue?: boolean;
}

export const LiveGameBanner: React.FC<LiveGameBannerProps> = ({
  liveGame,
  onPress,
  variant = 'default',
  showBetsCount = true,
  showVenue = true,
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'compact':
        return {
          container: styles.compactContainer,
          content: styles.compactContent,
          leftSection: styles.compactLeftSection,
          rightSection: styles.compactRightSection,
        };
      case 'minimal':
        return {
          container: styles.minimalContainer,
          content: styles.minimalContent,
          leftSection: styles.minimalLeftSection,
          rightSection: styles.minimalRightSection,
        };
      default:
        return {
          container: styles.container,
          content: styles.content,
          leftSection: styles.leftSection,
          rightSection: styles.rightSection,
        };
    }
  };

  const componentStyles = getStyles();

  const content = (
    <View style={componentStyles.container}>
      <View style={componentStyles.content}>
        <View style={componentStyles.leftSection}>
          <View style={styles.liveIndicator} />
          <Text style={styles.liveText}>LIVE</Text>
          {showVenue && (
            <Text style={styles.venueText}>{liveGame.venue}</Text>
          )}
        </View>

        <View style={styles.centerSection}>
          <View style={styles.scoreContainer}>
            <View style={styles.teamScoreRow}>
              <Text style={styles.teamNameText}>{liveGame.awayTeam}</Text>
              <Text style={styles.scoreText}>{liveGame.awayScore}</Text>
            </View>
            <View style={styles.teamScoreRow}>
              <Text style={styles.teamNameText}>{liveGame.homeTeam}</Text>
              <Text style={styles.scoreText}>{liveGame.homeScore}</Text>
            </View>
          </View>
          {liveGame.quarter && (
            <Text style={styles.quarterText}>
              {liveGame.quarter}
              {liveGame.timeLeft && ` • ${liveGame.timeLeft}`}
            </Text>
          )}
        </View>

        <View style={componentStyles.rightSection}>
          {showBetsCount && (
            <Text style={styles.betsCountText}>
              {liveGame.liveBetsCount} LIVE BETS
            </Text>
          )}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  // Default variant
  container: {
    backgroundColor: colors.live,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radius.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
  },

  // Compact variant
  compactContainer: {
    backgroundColor: colors.live,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.xs,
    marginHorizontal: spacing.sm,
    marginVertical: spacing.xs / 2,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  compactRightSection: {
    alignItems: 'flex-end',
  },

  // Minimal variant
  minimalContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs / 2,
    borderRadius: 0,
    marginHorizontal: 0,
    marginVertical: 0,
    borderWidth: 1,
    borderColor: colors.live,
  },
  minimalContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  minimalLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  minimalRightSection: {
    alignItems: 'flex-end',
  },

  // Common elements
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    marginRight: spacing.xs,
  },
  liveText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    marginRight: spacing.sm,
  },
  venueText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    opacity: 0.9,
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  scoreContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  teamScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 120,
    marginVertical: 2,
  },
  teamNameText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginRight: spacing.sm,
  },
  scoreText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.bold,
  },
  quarterText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs / 2,
    opacity: 0.9,
  },
  betsCountText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});