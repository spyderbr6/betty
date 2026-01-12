/**
 * Event Picker Modal
 * Modal for selecting upcoming events for squares games
 * Based on EventDiscoveryModal design, shows only UPCOMING events
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, textStyles, spacing, typography } from '../../styles';
import { ModalHeader } from '../ui/ModalHeader';
import { EventBadge } from '../ui/EventBadge';
import { getAllEventsFromCache } from '../../services/eventCacheService';
import type { LiveEvent, SportType } from '../../types/events';
import { showAlert } from '../ui/CustomAlert';

interface EventPickerModalProps {
  visible: boolean;
  onSelect: (event: any) => void;
  onClose: () => void;
}

export const EventPickerModal: React.FC<EventPickerModalProps> = ({
  visible,
  onSelect,
  onClose,
}) => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      loadEvents(false);
    } else {
      // Reset state when modal closes
      setSearchQuery('');
    }
  }, [visible]);

  const loadEvents = async (forceRefresh: boolean) => {
    try {
      setLoading(true);
      console.log(`[EventPickerModal] Loading upcoming events (forceRefresh: ${forceRefresh})`);

      // Fetch from cache (will use cached data unless expired or forceRefresh=true)
      const { upcomingEvents } = await getAllEventsFromCache(forceRefresh);

      // Filter to next 7 days only (not too far out)
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const filteredEvents = upcomingEvents.filter(event => {
        const eventTime = new Date(event.scheduledTime);
        return eventTime >= now && eventTime <= sevenDaysFromNow;
      });

      setEvents(filteredEvents);
      console.log(`[EventPickerModal] Loaded ${filteredEvents.length} upcoming events (next 7 days)`);
    } catch (error) {
      console.error('[EventPickerModal] Error loading events:', error);
      showAlert('Error', 'Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadEvents(true); // Force refresh on pull-to-refresh
    setRefreshing(false);
  };

  // Filter events based on search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) {
      return events;
    }

    const query = searchQuery.toLowerCase();
    return events.filter(
      (event) =>
        event.homeTeam.toLowerCase().includes(query) ||
        event.awayTeam.toLowerCase().includes(query) ||
        event.homeTeamCode?.toLowerCase().includes(query) ||
        event.awayTeamCode?.toLowerCase().includes(query) ||
        event.venue?.toLowerCase().includes(query) ||
        event.sport.toLowerCase().includes(query) ||
        event.league?.toLowerCase().includes(query)
    );
  }, [events, searchQuery]);

  const formatEventTime = (scheduledTime: string): string => {
    const date = new Date(scheduledTime);
    const now = new Date();

    // Check if it's today
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return `Today ${date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;
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
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleEventSelect = (event: LiveEvent) => {
    // Transform to match expected format
    onSelect({
      id: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeTeamCode: event.homeTeamCode,
      awayTeamCode: event.awayTeamCode,
      scheduledTime: event.scheduledTime,
      status: event.status,
      sport: event.sport,
      league: event.league,
    });
    onClose();
  };

  const renderEventItem = ({ item }: { item: LiveEvent }) => {
    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => handleEventSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          <EventBadge
            sport={item.sport as SportType}
            checkInCount={item.checkInCount}
            size="small"
          />
          <View style={styles.timeContainer}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.timeText}>{formatEventTime(item.scheduledTime)}</Text>
          </View>
        </View>

        <View style={styles.teamsContainer}>
          <View style={styles.teamRow}>
            <Text style={styles.teamCode}>{item.awayTeamCode || item.awayTeam.slice(0, 3).toUpperCase()}</Text>
            <Text style={styles.teamName} numberOfLines={1}>
              {item.awayTeam}
            </Text>
          </View>

          <View style={styles.teamRow}>
            <Text style={styles.teamCode}>{item.homeTeamCode || item.homeTeam.slice(0, 3).toUpperCase()}</Text>
            <Text style={styles.teamName} numberOfLines={1}>
              {item.homeTeam}
            </Text>
          </View>
        </View>

        {item.venue && (
          <Text style={styles.venue} numberOfLines={1}>
            📍 {item.venue}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="calendar-outline" size={64} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>
        {searchQuery.trim() ? 'No Matching Events' : 'No Upcoming Events'}
      </Text>
      <Text style={styles.emptyText}>
        {searchQuery.trim()
          ? 'No events match your search. Try different terms.'
          : 'No upcoming events in the next 7 days.'}
      </Text>
      {searchQuery.trim() ? (
        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>Clear Search</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Select Event" onClose={onClose} />

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons
              name="search"
              size={18}
              color={colors.textMuted}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search events..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEvents}
            renderItem={renderEventItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
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

  // Search
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radius.md,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    ...textStyles.body,
    color: colors.textPrimary,
  },
  clearButton: {
    padding: spacing.xs / 2,
  },

  // List
  listContainer: {
    padding: spacing.md,
  },

  // Event Card
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
  },
  timeText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 12,
  },
  teamsContainer: {
    marginBottom: spacing.xs,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs / 2,
  },
  teamCode: {
    ...textStyles.body,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
    fontSize: 12,
    width: 40,
  },
  teamName: {
    ...textStyles.body,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: typography.fontWeight.semibold,
  },
  venue: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontSize: 11,
    marginTop: spacing.xs / 2,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xl * 2,
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    fontWeight: typography.fontWeight.bold,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: spacing.radius.md,
  },
  refreshButtonText: {
    ...textStyles.body,
    color: colors.background,
    fontWeight: typography.fontWeight.semibold,
  },
});
