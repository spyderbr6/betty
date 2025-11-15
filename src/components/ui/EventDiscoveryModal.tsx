/**
 * EventDiscoveryModal Component
 *
 * Modal for browsing and checking into live sporting events
 * Uses centralized event cache for better performance
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalHeader } from './ModalHeader';
import { EventBadge } from './EventBadge';
import { colors, typography, spacing, textStyles } from '../../styles';
import { checkIntoEvent } from '../../services/eventService';
import { getAllEventsFromCache } from '../../services/eventCacheService';
import type { LiveEvent, SportType } from '../../types/events';

export interface EventDiscoveryModalProps {
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
  onCheckInSuccess?: (event: LiveEvent) => void;
}

type FilterTab = 'live' | 'upcoming';

export const EventDiscoveryModal: React.FC<EventDiscoveryModalProps> = ({
  visible,
  onClose,
  currentUserId,
  onCheckInSuccess,
}) => {
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('live');
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  // Load events once when modal opens
  useEffect(() => {
    if (visible) {
      loadEvents(false);
    } else {
      // Reset state when modal closes
      setCheckingIn(null);
    }
  }, [visible]);

  const loadEvents = async (forceRefresh: boolean) => {
    try {
      setLoading(true);
      console.log(`[EventDiscoveryModal] Loading events (forceRefresh: ${forceRefresh})`);

      // Fetch from cache (will use cached data unless expired or forceRefresh=true)
      const { liveEvents: live, upcomingEvents: upcoming } = await getAllEventsFromCache(forceRefresh);

      // Check for duplicates before setting state
      const liveIds = live.map(e => e.id);
      const upcomingIds = upcoming.map(e => e.id);
      const uniqueLiveIds = new Set(liveIds);
      const uniqueUpcomingIds = new Set(upcomingIds);

      if (liveIds.length !== uniqueLiveIds.size) {
        console.error(`[EventDiscoveryModal] ⚠️ LIVE EVENTS HAVE ${liveIds.length - uniqueLiveIds.size} DUPLICATES BEFORE setState!`);
        console.log('[EventDiscoveryModal] Live event IDs:', liveIds);
      }

      if (upcomingIds.length !== uniqueUpcomingIds.size) {
        console.error(`[EventDiscoveryModal] ⚠️ UPCOMING EVENTS HAVE ${upcomingIds.length - uniqueUpcomingIds.size} DUPLICATES BEFORE setState!`);
        console.log('[EventDiscoveryModal] Upcoming event IDs:', upcomingIds);
      }

      setLiveEvents(live);
      setUpcomingEvents(upcoming);

      // Auto-switch to upcoming tab if no live events
      if (live.length === 0 && upcoming.length > 0 && activeTab === 'live') {
        console.log('[EventDiscoveryModal] No live events, switching to upcoming tab');
        setActiveTab('upcoming');
      }

      console.log(`[EventDiscoveryModal] Loaded ${live.length} live, ${upcoming.length} upcoming events`);
    } catch (error) {
      console.error('[EventDiscoveryModal] Error loading events:', error);
      Alert.alert('Error', 'Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents(true); // Force refresh on pull-to-refresh
    setRefreshing(false);
  };

  // Get current tab's events
  const currentEvents = activeTab === 'live' ? liveEvents : upcomingEvents;

  // Debug: Log what's being rendered
  useEffect(() => {
    const ids = currentEvents.map(e => e.id);
    const uniqueIds = new Set(ids);
    console.log(`[EventDiscoveryModal] Rendering ${currentEvents.length} events on ${activeTab} tab`);
    console.log(`[EventDiscoveryModal] Current event IDs:`, ids);

    if (ids.length !== uniqueIds.size) {
      console.error(`[EventDiscoveryModal] ⚠️ RENDERING ${ids.length - uniqueIds.size} DUPLICATE EVENTS IN FLATLIST!`);
      // Find which IDs are duplicated
      const idCounts = new Map<string, number>();
      ids.forEach(id => {
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      });
      const duplicatedIds = Array.from(idCounts.entries()).filter(([_, count]) => count > 1);
      console.error('[EventDiscoveryModal] Duplicated IDs and counts:', duplicatedIds);
    }
  }, [currentEvents, activeTab]);

  const handleCheckIn = async (event: LiveEvent) => {
    try {
      setCheckingIn(event.id);

      const checkIn = await checkIntoEvent(currentUserId, event.id);

      if (!checkIn) {
        Alert.alert('Error', 'Failed to check in. Please try again.');
        setCheckingIn(null);
        return;
      }

      // Call success callback first to update parent state
      if (onCheckInSuccess) {
        onCheckInSuccess(event);
      }

      // Close modal immediately
      onClose();

      // Show success message (optional - non-blocking)
      setTimeout(() => {
        Alert.alert(
          'Checked In!',
          `You're now checked into ${event.homeTeam} vs ${event.awayTeam}`
        );
      }, 300); // Small delay to allow modal close animation
    } catch (error) {
      console.error('Error checking in:', error);
      Alert.alert('Error', 'Failed to check in. Please try again.');
      setCheckingIn(null);
    }
  };

  const formatEventTime = (scheduledTime: string): string => {
    const date = new Date(scheduledTime);
    const now = new Date();

    // Check if it's today
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();

    if (isTomorrow) {
      return `Tomorrow ${date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;
    }

    // Other dates
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'LIVE':
        return colors.live;
      case 'HALFTIME':
        return colors.warning;
      case 'UPCOMING':
        return colors.active;
      case 'FINISHED':
        return colors.textSecondary;
      default:
        return colors.textSecondary;
    }
  };

  const renderEventItem = ({ item }: { item: LiveEvent }) => {
    const isCheckingInThis = checkingIn === item.id;

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => handleCheckIn(item)}
        disabled={isCheckingInThis || checkingIn !== null}
      >
        <View style={styles.eventHeader}>
          <EventBadge
            sport={item.sport as SportType}
            checkInCount={item.checkInCount}
            size="small"
          />
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status === 'LIVE'
                ? 'LIVE'
                : item.status === 'HALFTIME'
                ? 'HALFTIME'
                : formatEventTime(item.scheduledTime)}
            </Text>
          </View>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <Text style={styles.teamCode}>{item.awayTeamCode || item.awayTeam.slice(0, 3).toUpperCase()}</Text>
            <Text style={styles.teamName} numberOfLines={1}>
              {item.awayTeam}
            </Text>
            {(item.status === 'LIVE' || item.status === 'HALFTIME') && (
              <Text style={styles.score}>{item.awayScore}</Text>
            )}
          </View>

          <View style={styles.teamRow}>
            <Text style={styles.teamCode}>{item.homeTeamCode || item.homeTeam.slice(0, 3).toUpperCase()}</Text>
            <Text style={styles.teamName} numberOfLines={1}>
              {item.homeTeam}
            </Text>
            {(item.status === 'LIVE' || item.status === 'HALFTIME') && (
              <Text style={styles.score}>{item.homeScore}</Text>
            )}
          </View>
        </View>

        {item.venue && (
          <Text style={styles.venue} numberOfLines={1}>
            📍 {item.venue}
          </Text>
        )}

        {isCheckingInThis && (
          <View style={styles.checkingInContainer}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.checkingInText}>Checking in...</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {activeTab === 'live'
          ? 'No live events right now'
          : 'No upcoming events in the next 24 hours'}
      </Text>
      <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Live Events" onClose={onClose} />

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'live' && styles.tabActive]}
            onPress={() => setActiveTab('live')}
          >
            <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
              Live Now
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
            onPress={() => setActiveTab('upcoming')}
          >
            <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
              Upcoming
            </Text>
          </TouchableOpacity>
        </View>

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={currentEvents}
            renderItem={renderEventItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...textStyles.label,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs / 2,
  },
  statusText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  teamsContainer: {
    marginBottom: spacing.sm,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs / 2,
  },
  teamCode: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    width: 40,
  },
  teamName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  score: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  venue: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  checkingInContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  checkingInText: {
    marginLeft: spacing.sm,
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  refreshButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.sm,
  },
  refreshButtonText: {
    color: colors.textInverse,
    fontWeight: typography.fontWeight.semibold,
  },
});
