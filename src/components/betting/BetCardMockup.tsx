/**
 * Bet Card Mockup Comparison
 * Visual demonstration of layout improvements
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { ImprovedBetCard } from './ImprovedBetCard';
import { colors, spacing, textStyles } from '../../styles';

export const BetCardMockup: React.FC = () => {
  // Sample bet data for different states
  const activeBet = {
    id: '1',
    title: 'Next 3PT Made',
    description: 'LeBron James makes next 3-point attempt',
    status: 'ACTIVE' as const,
    totalPot: 50,
    betAmount: 10,
    sideAName: 'Yes',
    sideBName: 'No',
    participantCount: 2,
    sideACount: 1,
    sideBCount: 1,
    timeRemaining: '45m',
    creatorName: 'John D.',
    isCreator: false,
  };

  const liveBet = {
    id: '2',
    title: 'LAL 89 - 92 GSW',
    status: 'LIVE' as const,
    totalPot: 200,
    sideAName: 'Lakers',
    sideBName: 'Warriors',
    participantCount: 8,
    sideACount: 3,
    sideBCount: 5,
    timeRemaining: 'Q4 3:42',
    userSide: 'A' as const,
    userAmount: 25,
    creatorName: 'Mike S.',
    isCreator: true, // User is creator of this live bet
  };

  const pendingBet = {
    id: '3',
    title: 'Next Foul',
    description: 'Which team commits next foul?',
    status: 'PENDING_RESOLUTION' as const,
    totalPot: 75,
    sideAName: 'Home Team',
    sideBName: 'Away Team',
    participantCount: 5,
    sideACount: 2,
    sideBCount: 3,
    userSide: 'B' as const,
    userAmount: 15,
    creatorName: 'Sarah L.',
    isCreator: false,
  };

  const complexBet = {
    id: '4',
    title: 'Final Result: Lakers vs Warriors Moneyline',
    description: 'Full game result prediction - regulation time only',
    status: 'ACTIVE' as const,
    totalPot: 500,
    betAmount: 50,
    sideAName: 'Lakers Win',
    sideBName: 'Warriors Win',
    participantCount: 10,
    sideACount: 4,
    sideBCount: 6,
    timeRemaining: '2h 15m',
    creatorName: 'Alex K.',
    isCreator: false,
  };

  const creatorActiveBet = {
    id: '5',
    title: 'Player Prop',
    description: 'Player performance bet',
    status: 'ACTIVE' as const,
    totalPot: 100,
    betAmount: 20,
    sideAName: 'Over 25.5 pts',
    sideBName: 'Under 25.5 pts',
    participantCount: 5,
    sideACount: 3,
    sideBCount: 2,
    timeRemaining: '1h 30m',
    userSide: 'A' as const,
    userAmount: 20,
    creatorName: 'You',
    isCreator: true, // User is creator and participant
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LAYOUT IMPROVEMENTS</Text>
        <Text style={styles.sectionDescription}>
          Optimized space utilization with better visual hierarchy
        </Text>
      </View>

      {/* Key Improvements List */}
      <View style={styles.improvementsList}>
        <ImprovementItem
          icon="✓"
          title="Inline Status Badge"
          description="Status moved to header row, saving vertical space"
        />
        <ImprovementItem
          icon="✓"
          title="Compact Metadata"
          description="Time, participants, and creator in single row"
        />
        <ImprovementItem
          icon="✓"
          title="Horizontal Sides Layout"
          description="Side-by-side display with participant counts"
        />
        <ImprovementItem
          icon="✓"
          title="Smart Action Buttons"
          description="Invite always visible for ACTIVE/LIVE • End bet for creators"
        />
        <ImprovementItem
          icon="✓"
          title="Visual Hierarchy"
          description="Pot amount prominently displayed in header"
        />
        <ImprovementItem
          icon="✓"
          title="Reduced Redundancy"
          description="Side emphasis shows participation, no extra text needed"
        />
      </View>

      {/* Example Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIVE BET</Text>
        <Text style={styles.cardDescription}>
          User can join either side • Shows join amount and invite option
        </Text>
        <ImprovedBetCard
          bet={activeBet}
          onPress={() => console.log('Card pressed')}
          onJoin={() => console.log('Join pressed')}
          onInvite={() => console.log('Invite pressed')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LIVE BET (USER PARTICIPATING)</Text>
        <Text style={styles.cardDescription}>
          Red accent border • Live pulse indicator • Shows user's side and amount • Creator can
          invite and end bet
        </Text>
        <ImprovedBetCard
          bet={liveBet}
          onPress={() => console.log('Card pressed')}
          onInvite={() => console.log('Invite pressed')}
          onEndBet={() => console.log('End bet pressed')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PENDING RESOLUTION</Text>
        <Text style={styles.cardDescription}>
          Waiting for outcome • Shows which side user chose
        </Text>
        <ImprovedBetCard bet={pendingBet} onPress={() => console.log('Card pressed')} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>COMPLEX BET WITH LONG TEXT</Text>
        <Text style={styles.cardDescription}>Tests text truncation and description handling</Text>
        <ImprovedBetCard
          bet={complexBet}
          onPress={() => console.log('Card pressed')}
          onJoin={() => console.log('Join pressed')}
          onInvite={() => console.log('Invite pressed')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CREATOR IN ACTIVE BET</Text>
        <Text style={styles.cardDescription}>
          User is creator and participant • Shows invite and end bet options
        </Text>
        <ImprovedBetCard
          bet={creatorActiveBet}
          onPress={() => console.log('Card pressed')}
          onInvite={() => console.log('Invite pressed')}
          onEndBet={() => console.log('End bet pressed')}
        />
      </View>

      {/* Space Savings Comparison */}
      <View style={styles.comparisonSection}>
        <Text style={styles.sectionTitle}>SPACE EFFICIENCY</Text>
        <View style={styles.comparisonGrid}>
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonLabel}>OLD LAYOUT</Text>
            <Text style={styles.comparisonValue}>~220px</Text>
            <Text style={styles.comparisonDescription}>Per card height with padding</Text>
          </View>
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonLabel}>NEW LAYOUT</Text>
            <Text style={styles.comparisonValue}>~160px</Text>
            <Text style={styles.comparisonDescription}>Per card height with padding</Text>
          </View>
        </View>
        <Text style={styles.savingsText}>
          ~27% reduction in vertical space • More bets visible per screen
        </Text>
      </View>

      {/* Design System Compliance */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DESIGN SYSTEM COMPLIANCE</Text>
        <View style={styles.complianceList}>
          <ComplianceItem title="Colors" value="All from colors.* tokens" />
          <ComplianceItem title="Typography" value="textStyles.* patterns" />
          <ComplianceItem title="Spacing" value="spacing.* scale" />
          <ComplianceItem title="Shadows" value="shadows.card / liveBetCard" />
          <ComplianceItem title="Border Radius" value="spacing.radius.* values" />
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
};

const ImprovementItem: React.FC<{ icon: string; title: string; description: string }> = ({
  icon,
  title,
  description,
}) => (
  <View style={styles.improvementItem}>
    <Text style={styles.improvementIcon}>{icon}</Text>
    <View style={styles.improvementContent}>
      <Text style={styles.improvementTitle}>{title}</Text>
      <Text style={styles.improvementDescription}>{description}</Text>
    </View>
  </View>
);

const ComplianceItem: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <View style={styles.complianceItem}>
    <Text style={styles.complianceTitle}>{title}</Text>
    <Text style={styles.complianceValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  cardDescription: {
    ...textStyles.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },

  // Improvements List
  improvementsList: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: spacing.radius.lg,
    padding: spacing.md,
  },
  improvementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  improvementIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
    color: colors.active,
  },
  improvementContent: {
    flex: 1,
  },
  improvementTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 2,
  },
  improvementDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },

  // Comparison Section
  comparisonSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  comparisonGrid: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  comparisonCard: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: spacing.radius.lg,
    marginRight: spacing.xs,
    alignItems: 'center',
  },
  comparisonLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: spacing.xs,
  },
  comparisonValue: {
    ...textStyles.h2,
    color: colors.primary,
    marginBottom: spacing.xs / 2,
  },
  comparisonDescription: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
  },
  savingsText: {
    ...textStyles.body,
    color: colors.active,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Compliance List
  complianceList: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  complianceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  complianceTitle: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: 13,
  },
  complianceValue: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },

  bottomPadding: {
    height: spacing.xl,
  },
});
