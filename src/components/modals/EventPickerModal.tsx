/**
 * Event Picker Modal
 * Modal for selecting a live event for squares games
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import { colors, textStyles, spacing, typography } from '../../styles';
import { ModalHeader } from '../ui/ModalHeader';
import { Ionicons } from '@expo/vector-icons';

const client = generateClient<Schema>();

interface LiveEvent {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  scheduledTime: string;
  status: string;
  sport?: string;
  league?: string;
}

interface EventPickerModalProps {
  visible: boolean;
  onSelect: (event: LiveEvent) => void;
  onClose: () => void;
}

export const EventPickerModal: React.FC<EventPickerModalProps> = ({
  visible,
  onSelect,
  onClose,
}) => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadEvents();
    }
  }, [visible]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // Fetch upcoming and live events
      const { data } = await client.models.LiveEvent.list({
        filter: {
          or: [
            { status: { eq: 'UPCOMING' } },
            { status: { eq: 'LIVE' } },
          ],
        },
      });

      if (data) {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Filter and sort events
        const sortedEvents = data
          .map(event => ({
            id: event.id!,
            homeTeam: event.homeTeam!,
            awayTeam: event.awayTeam!,
            homeTeamCode: event.homeTeamCode || undefined,
            awayTeamCode: event.awayTeamCode || undefined,
            scheduledTime: event.scheduledTime!,
            status: event.status!,
            sport: event.sport || undefined,
            league: event.league || undefined,
          }))
          // Filter: Only events within next 7 days or currently live
          .filter(event => {
            if (event.status === 'LIVE') return true;
            const eventTime = new Date(event.scheduledTime);
            return eventTime >= now && eventTime <= sevenDaysFromNow;
          })
          // Sort: LIVE events first, then by scheduled time (soonest first)
          .sort((a, b) => {
            // LIVE events always come first
            if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
            if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
            // Both LIVE or both UPCOMING - sort by time
            return new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();
          });

        console.log(`[EventPicker] Loaded ${sortedEvents.length} events (filtered to next 7 days)`);
        setEvents(sortedEvents);
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = selectedSport
    ? events.filter(e => e.sport === selectedSport)
    : events;

  const uniqueSports = Array.from(new Set(events.map(e => e.sport).filter(Boolean)));

  const renderEvent = ({ item }: { item: LiveEvent }) => {
    const eventDate = new Date(item.scheduledTime);
    const isToday = eventDate.toDateString() === new Date().toDateString();

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => onSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.eventHeader}>
          {item.sport && (
            <View style={styles.sportBadge}>
              <Text style={styles.sportBadgeText}>{item.sport}</Text>
            </View>
          )}
          {item.status === 'LIVE' && (
            <View style={styles.liveBadge}>
              <View style={styles.liveIndicator} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.eventTeams}>
          <Text style={styles.eventTeamText}>
            {item.awayTeamCode || item.awayTeam}
          </Text>
          <Text style={styles.eventVsText}>@</Text>
          <Text style={styles.eventTeamText}>
            {item.homeTeamCode || item.homeTeam}
          </Text>
        </View>

        <View style={styles.eventFooter}>
          <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
          <Text style={styles.eventTime}>
            {isToday ? 'Today' : eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            {' • '}
            {eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Select Event" onClose={onClose} />

        {/* Sport Filter */}
        {uniqueSports.length > 1 && (
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                !selectedSport && styles.filterChipActive,
              ]}
              onPress={() => setSelectedSport(null)}
            >
              <Text style={[
                styles.filterChipText,
                !selectedSport && styles.filterChipTextActive,
              ]}>
                All
              </Text>
            </TouchableOpacity>

            {uniqueSports.map(sport => (
              <TouchableOpacity
                key={sport}
                style={[
                  styles.filterChip,
                  selectedSport === sport && styles.filterChipActive,
                ]}
                onPress={() => setSelectedSport(sport as string)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedSport === sport && styles.filterChipTextActive,
                ]}>
                  {sport}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading events...</Text>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Events Available</Text>
            <Text style={styles.emptySubtitle}>
              There are no upcoming or live events at the moment.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredEvents}
            renderItem={renderEvent}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
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

  // Filter
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radius.md,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  filterChipTextActive: {
    color: colors.background,
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
    marginBottom: spacing.sm,
  },
  sportBadge: {
    backgroundColor: colors.background,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    marginRight: spacing.xs,
  },
  sportBadgeText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error,
    borderRadius: spacing.radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    marginRight: spacing.xs / 2,
  },
  liveBadgeText: {
    ...textStyles.caption,
    color: colors.background,
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
  },
  eventTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  eventTeamText: {
    ...textStyles.h4,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  eventVsText: {
    ...textStyles.body,
    color: colors.textMuted,
    marginHorizontal: spacing.sm,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTime: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    ...textStyles.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    fontWeight: typography.fontWeight.bold,
  },
  emptySubtitle: {
    ...textStyles.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
