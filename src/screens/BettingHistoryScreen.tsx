/**
 * Betting History Screen
 * Review past bets and outcomes with filtering options
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { colors, spacing, textStyles, typography } from '../styles';
import { ModalHeader } from '../components/ui/ModalHeader';
import { useAuth } from '../contexts/AuthContext';
import { Bet } from '../types/betting';
import { formatCurrency } from '../utils/formatting';
import { bulkLoadUserBetsWithParticipants } from '../services/bulkLoadingService';

const client = generateClient<Schema>();

interface BettingHistoryScreenProps {
  onClose: () => void;
}

type FilterType = 'all' | 'won' | 'lost' | 'cancelled';

interface HistoryBet extends Bet {
  userSide?: 'A' | 'B';
  userAmount?: number;
  userPayout?: number;
  outcome: 'won' | 'lost' | 'cancelled' | 'active';
}

export const BettingHistoryScreen: React.FC<BettingHistoryScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [bets, setBets] = useState<HistoryBet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchBettingHistory = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Fetch user's bets with participants
      const userBets = await bulkLoadUserBetsWithParticipants(user.userId);

      // Transform to history bets with outcome info
      const historyBets: HistoryBet[] = userBets.map(bet => {
        const userParticipation = bet.participants?.find(p => p.userId === user.userId);

        let outcome: HistoryBet['outcome'] = 'active';
        if (bet.status === 'CANCELLED') {
          outcome = 'cancelled';
        } else if (bet.status === 'RESOLVED' && bet.winningSide && userParticipation) {
          outcome = userParticipation.side === bet.winningSide ? 'won' : 'lost';
        }

        return {
          ...bet,
          userSide: userParticipation?.side as 'A' | 'B' | undefined,
          userAmount: userParticipation?.amount,
          userPayout: userParticipation?.payout,
          outcome,
        };
      });

      // Sort by creation date, newest first
      historyBets.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setBets(historyBets);
    } catch (error) {
      console.error('Error fetching betting history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchBettingHistory();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchBettingHistory();
  }, [user]);

  const filteredBets = bets.filter(bet => {
    if (filter === 'all') return true;
    return bet.outcome === filter;
  });

  const renderFilterButton = (type: FilterType, label: string, icon: keyof typeof Ionicons.glyphMap) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === type && styles.filterButtonActive]}
      onPress={() => setFilter(type)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={16}
        color={filter === type ? colors.background : colors.textSecondary}
      />
      <Text style={[styles.filterButtonText, filter === type && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Betting History" onClose={onClose} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ModalHeader title="Betting History" onClose={onClose} />

      {/* Filters */}
      <View style={styles.filtersContainer}>
        {renderFilterButton('all', 'All', 'list-outline')}
        {renderFilterButton('won', 'Won', 'trophy-outline')}
        {renderFilterButton('lost', 'Lost', 'close-circle-outline')}
        {renderFilterButton('cancelled', 'Cancelled', 'ban-outline')}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {filteredBets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No betting history' : `No ${filter} bets`}
            </Text>
          </View>
        ) : (
          filteredBets.map((bet) => (
            <HistoryBetCard key={bet.id} bet={bet} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// History Bet Card Component
interface HistoryBetCardProps {
  bet: HistoryBet;
}

const HistoryBetCard: React.FC<HistoryBetCardProps> = ({ bet }) => {
  const getOutcomeColor = () => {
    switch (bet.outcome) {
      case 'won': return colors.info;
      case 'lost': return colors.error;
      case 'cancelled': return colors.textMuted;
      default: return colors.success;
    }
  };

  const getOutcomeLabel = () => {
    switch (bet.outcome) {
      case 'won': return 'Won';
      case 'lost': return 'Lost';
      case 'cancelled': return 'Cancelled';
      default: return 'Active';
    }
  };

  const getOutcomeIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (bet.outcome) {
      case 'won': return 'trophy';
      case 'lost': return 'close-circle';
      case 'cancelled': return 'ban';
      default: return 'hourglass';
    }
  };

  const parseBetOdds = (odds: any) => {
    try {
      const parsedOdds = typeof odds === 'string' ? JSON.parse(odds) : odds;
      return {
        sideAName: parsedOdds?.sideAName || 'Side A',
        sideBName: parsedOdds?.sideBName || 'Side B',
      };
    } catch {
      return { sideAName: 'Side A', sideBName: 'Side B' };
    }
  };

  const betOdds = parseBetOdds(bet.odds);
  const userSideName = bet.userSide === 'A' ? betOdds.sideAName : betOdds.sideBName;
  const netResult = bet.outcome === 'won'
    ? (bet.userPayout || 0) - (bet.userAmount || 0)
    : bet.outcome === 'lost'
    ? -(bet.userAmount || 0)
    : 0;

  return (
    <View style={[styles.historyCard, { borderLeftColor: getOutcomeColor() }]}>
      <View style={styles.historyCardHeader}>
        <View style={styles.historyCardHeaderLeft}>
          <Ionicons name={getOutcomeIcon()} size={20} color={getOutcomeColor()} />
          <Text style={[styles.outcomeLabel, { color: getOutcomeColor() }]}>
            {getOutcomeLabel()}
          </Text>
        </View>
        <Text style={styles.dateText}>
          {new Date(bet.createdAt).toLocaleDateString()}
        </Text>
      </View>

      <Text style={styles.historyBetTitle}>{bet.title}</Text>
      <Text style={styles.historyBetDescription} numberOfLines={2}>
        {bet.description}
      </Text>

      {bet.userSide && (
        <View style={styles.userSideContainer}>
          <Text style={styles.userSideLabel}>Your side:</Text>
          <Text style={styles.userSideName}>{userSideName}</Text>
        </View>
      )}

      <View style={styles.historyCardFooter}>
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Wagered</Text>
          <Text style={styles.amountValue}>{formatCurrency(bet.userAmount || 0)}</Text>
        </View>

        {bet.outcome === 'won' && (
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Won</Text>
            <Text style={[styles.amountValue, { color: colors.info }]}>
              +{formatCurrency(netResult)}
            </Text>
          </View>
        )}

        {bet.outcome === 'lost' && (
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Lost</Text>
            <Text style={[styles.amountValue, { color: colors.error }]}>
              {formatCurrency(netResult)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl * 2,
  },
  emptyText: {
    ...textStyles.h4,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // Filters
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs / 2,
    fontSize: 12,
    fontWeight: typography.fontWeight.medium,
  },
  filterButtonTextActive: {
    color: colors.background,
  },

  // History Card
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 4,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  historyCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outcomeLabel: {
    ...textStyles.button,
    fontWeight: typography.fontWeight.semibold,
    marginLeft: spacing.xs,
  },
  dateText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  historyBetTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  historyBetDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
  },
  userSideContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  userSideLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  userSideName: {
    ...textStyles.button,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  historyCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amountContainer: {
    alignItems: 'flex-start',
  },
  amountLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  amountValue: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
  },
});
