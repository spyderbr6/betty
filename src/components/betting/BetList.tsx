/**
 * BetList Component
 * Professional betting list with search, filters, and infinite scroll
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ListRenderItem,
} from 'react-native';
import { colors, typography, spacing, textStyles, commonStyles } from '../../styles';
import { Bet, BetFilters, BetStatus } from '../../types/betting';
import { BetCard } from './BetCard';

export interface BetListProps {
  bets: Bet[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  onBetPress?: (bet: Bet) => void;
  onJoinBet?: (betId: string, side: string, amount: number) => void;
  onInviteFriends?: (bet: Bet) => void;
  onEndBet?: (bet: Bet) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  showSearch?: boolean;
  showFilters?: boolean;
  initialFilters?: BetFilters;
  variant?: 'default' | 'compact';
}

export const BetList: React.FC<BetListProps> = ({
  bets,
  isRefreshing = false,
  onRefresh,
  onLoadMore,
  onBetPress,
  onJoinBet,
  onInviteFriends,
  onEndBet,
  emptyTitle = 'No bets found',
  emptyDescription = 'Check back later or create the first bet!',
  showSearch = true,
  showFilters = true,
  initialFilters,
  variant = 'default',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<BetFilters>(initialFilters || {});

  // Filter and search logic
  const filteredBets = useMemo(() => {
    let filtered = [...bets];

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(bet =>
        bet.title.toLowerCase().includes(query) ||
        bet.description.toLowerCase().includes(query) ||
        bet.creator?.username.toLowerCase().includes(query)
      );
    }

    // Apply status filters
    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter(bet => filters.status!.includes(bet.status));
    }

    // Apply category filters
    if (filters.category && filters.category.length > 0) {
      filtered = filtered.filter(bet => filters.category!.includes(bet.category));
    }

    // Apply pot size filters
    if (filters.minPot !== undefined) {
      filtered = filtered.filter(bet => bet.totalPot >= filters.minPot!);
    }
    if (filters.maxPot !== undefined) {
      filtered = filtered.filter(bet => bet.totalPot <= filters.maxPot!);
    }

    // Sort by status priority (LIVE > ACTIVE > others)
    filtered.sort((a, b) => {
      const statusPriority = { LIVE: 3, ACTIVE: 2, PENDING_RESOLUTION: 1 };
      const aPriority = statusPriority[a.status as keyof typeof statusPriority] || 0;
      const bPriority = statusPriority[b.status as keyof typeof statusPriority] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Then sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return filtered;
  }, [bets, searchQuery, filters]);

  const renderBetCard: ListRenderItem<Bet> = ({ item }) => (
    <BetCard
      bet={item}
      onPress={onBetPress}
      onJoinBet={onJoinBet}
      onInviteFriends={onInviteFriends}
      onEndBet={onEndBet}
      variant={variant}
    />
  );

  const renderHeader = () => {
    if (!showSearch && !showFilters) return null;

    return (
      <View style={styles.header}>
        {showSearch && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search bets..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
          </View>
        )}
        
        {showFilters && (
          <View style={styles.filtersContainer}>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => {}}
            >
              <Text style={styles.filterButtonText}>Filter</Text>
              {hasActiveFilters() && <View style={styles.filterIndicator} />}
            </TouchableOpacity>
            
            {/* Quick filter chips */}
            <View style={styles.quickFilters}>
              <FilterChip
                label="Live"
                active={filters.status?.includes('LIVE') ?? false}
                onPress={() => toggleStatusFilter('LIVE')}
              />
              <FilterChip
                label="Active"
                active={filters.status?.includes('ACTIVE') ?? false}
                onPress={() => toggleStatusFilter('ACTIVE')}
              />
              <FilterChip
                label="Sports"
                active={filters.category?.includes('SPORTS') ?? false}
                onPress={() => toggleCategoryFilter('SPORTS')}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{emptyTitle}</Text>
      <Text style={styles.emptyDescription}>{emptyDescription}</Text>
    </View>
  );

  const renderSeparator = () => <View style={styles.separator} />;

  const hasActiveFilters = (): boolean => {
    return !!(
      (filters.status && filters.status.length > 0) ||
      (filters.category && filters.category.length > 0) ||
      filters.minPot !== undefined ||
      filters.maxPot !== undefined
    );
  };

  const toggleStatusFilter = (status: BetStatus) => {
    setFilters(prev => {
      const currentStatuses = prev.status || [];
      const hasStatus = currentStatuses.includes(status);
      
      return {
        ...prev,
        status: hasStatus
          ? currentStatuses.filter(s => s !== status)
          : [...currentStatuses, status],
      };
    });
  };

  const toggleCategoryFilter = (category: string) => {
    setFilters(prev => {
      const currentCategories = prev.category || [];
      const hasCategory = currentCategories.includes(category as any);
      
      return {
        ...prev,
        category: hasCategory
          ? currentCategories.filter(c => c !== category)
          : [...currentCategories, category as any],
      };
    });
  };

  const clearAllFilters = () => {
    setFilters({});
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredBets}
        keyExtractor={(item) => item.id}
        renderItem={renderBetCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={variant === 'compact' ? renderSeparator : undefined}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          filteredBets.length === 0 && styles.listContentEmpty,
        ]}
      />

      {/* Results summary */}
      {filteredBets.length > 0 && (
        <View style={styles.resultsSummary}>
          <Text style={styles.resultsText}>
            {filteredBets.length} bet{filteredBets.length !== 1 ? 's' : ''}
            {searchQuery && ` matching "${searchQuery}"`}
          </Text>
          {hasActiveFilters() && (
            <TouchableOpacity onPress={clearAllFilters}>
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// Filter chip component
interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.filterChip, active && styles.filterChipActive]}
    onPress={onPress}
  >
    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Header
  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchContainer: {
    marginBottom: spacing.sm,
  },
  searchInput: {
    ...commonStyles.textInput,
    height: 44,
  },
  
  // Filters
  filtersContainer: {
    // gap is not supported on native; use margins on children
  },
  filterButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonText: {
    ...textStyles.button,
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
  },
  filterIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginLeft: spacing.xs,
  },
  quickFilters: {
    flexDirection: 'row',
    // gap is not supported on native; use margin on chips
    marginTop: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: spacing.radius.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
  
  // List
  listContent: {
    flexGrow: 1,
  },
  listContentEmpty: {
    justifyContent: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginHorizontal: spacing.md,
  },
  
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    ...textStyles.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  
  // Results summary
  resultsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resultsText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  clearFiltersText: {
    ...textStyles.caption,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
  },
});
