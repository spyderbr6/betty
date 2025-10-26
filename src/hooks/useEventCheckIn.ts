/**
 * useEventCheckIn Hook
 * Shared hook for managing event check-in state across all screens
 */

import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getUserCheckedInEvent, checkOutOfEvent } from '../services/eventService';
import type { LiveEvent } from '../types/events';
import { useAuth } from '../contexts/AuthContext';

const client = generateClient<Schema>();

export const useEventCheckIn = () => {
  const { user } = useAuth();
  const [checkedInEvent, setCheckedInEvent] = useState<LiveEvent | null>(null);
  const [nearbyEventsCount, setNearbyEventsCount] = useState(0);
  const [showEventDiscovery, setShowEventDiscovery] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch checked-in event on mount and when user changes
  useEffect(() => {
    if (user?.userId) {
      fetchCheckedInEvent();
      fetchNearbyEventsCount();
    }
  }, [user?.userId]);

  const fetchCheckedInEvent = async () => {
    if (!user?.userId) return;

    try {
      const result = await getUserCheckedInEvent(user.userId);
      if (result) {
        setCheckedInEvent(result.event);
      } else {
        setCheckedInEvent(null);
      }
    } catch (error) {
      console.error('Error fetching checked-in event:', error);
    }
  };

  const fetchNearbyEventsCount = async () => {
    try {
      // Fetch live events count
      const { data: liveEvents } = await client.models.LiveEvent.list({
        filter: {
          status: { eq: 'LIVE' }
        }
      });
      setNearbyEventsCount(liveEvents?.length || 0);
    } catch (error) {
      console.error('Error fetching nearby events count:', error);
    }
  };

  const handleCheckInPress = () => {
    setShowEventDiscovery(true);
  };

  const handleCheckOut = async () => {
    if (!user?.userId || !checkedInEvent) return;

    try {
      setIsLoading(true);
      const result = await getUserCheckedInEvent(user.userId);
      if (result) {
        await checkOutOfEvent(user.userId, result.checkIn.id);
        setCheckedInEvent(null);
        // Refresh nearby events count after checkout
        await fetchNearbyEventsCount();
        // Removed success message - checkout is implied by UI change
      }
    } catch (error) {
      console.error('Error checking out:', error);
      Alert.alert('Error', 'Failed to check out. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckInSuccess = (event: LiveEvent) => {
    // Update local state immediately for instant UI feedback
    setCheckedInEvent(event);
    // Close modal (will also be called by modal itself, but safe to call twice)
    setShowEventDiscovery(false);
    // Refresh nearby events count
    fetchNearbyEventsCount();
  };

  return {
    // State
    checkedInEvent,
    nearbyEventsCount,
    showEventDiscovery,
    isLoading,
    // Actions
    setShowEventDiscovery,
    handleCheckInPress,
    handleCheckOut,
    handleCheckInSuccess,
    // Refresh functions
    refreshCheckInState: fetchCheckedInEvent,
    refreshNearbyEventsCount: fetchNearbyEventsCount,
  };
};
