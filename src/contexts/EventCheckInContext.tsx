/**
 * EventCheckInContext
 * Global state management for event check-in with cache invalidation
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getUserCheckedInEvent, checkOutOfEvent } from '../services/eventService';
import { getLiveEventsFromCache } from '../services/eventCacheService';
import type { LiveEvent } from '../types/events';
import { useAuth } from './AuthContext';
import { showAlert } from '../components/ui/CustomAlert';

const client = generateClient<Schema>();

interface EventCheckInContextType {
  // State
  checkedInEvent: LiveEvent | null;
  nearbyEventsCount: number;
  showEventDiscovery: boolean;
  isLoading: boolean;
  // Actions
  setShowEventDiscovery: (show: boolean) => void;
  handleCheckInPress: () => void;
  handleCheckOut: () => Promise<void>;
  handleCheckInSuccess: (event: LiveEvent) => void;
  // Refresh functions
  refreshCheckInState: () => Promise<void>;
  refreshNearbyEventsCount: () => Promise<void>;
}

const EventCheckInContext = createContext<EventCheckInContextType | undefined>(undefined);

interface EventCheckInProviderProps {
  children: ReactNode;
}

export const EventCheckInProvider: React.FC<EventCheckInProviderProps> = ({ children }) => {
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
    } else {
      // Clear state when user logs out
      setCheckedInEvent(null);
      setNearbyEventsCount(0);
    }
  }, [user?.userId]);

  // Real-time subscription to EventCheckIn changes.
  //
  // Filtered onCreate/onUpdate rather than observeQuery: observeQuery issues an
  // initial listEventCheckIns, which is a filtered Scan — it applies its limit to
  // rows examined rather than rows returned, so it goes quietly incomplete as the
  // table grows. It also duplicated work, because the mount effect above already
  // loads the current check-in through the indexed checkInsByUser query.
  //
  // Both subscriptions carry a userId filter so AppSync does not fan every
  // check-in on the platform out to every connected device (assessment F7).
  useEffect(() => {
    if (!user?.userId) return;

    console.log('[EventCheckIn] Subscribing to check-in changes for user:', user.userId);

    const filter = { userId: { eq: user.userId } };

    // Re-read through the indexed path rather than trusting the event payload:
    // a check-in change can flip which row is active, and the query already
    // resolves that plus the LiveEvent join in one place.
    const onChange = () => {
      fetchCheckedInEvent().catch((error) =>
        console.error('[EventCheckIn] Error refreshing after change:', error)
      );
    };

    const subscriptions = [
      client.models.EventCheckIn.onCreate({ filter }).subscribe({
        next: onChange,
        error: (error: unknown) => console.error('[EventCheckIn] onCreate error:', error),
      }),
      client.models.EventCheckIn.onUpdate({ filter }).subscribe({
        next: onChange,
        error: (error: unknown) => console.error('[EventCheckIn] onUpdate error:', error),
      }),
    ];

    return () => {
      console.log('[EventCheckIn] Cleaning up subscriptions');
      subscriptions.forEach((s) => s.unsubscribe());
    };
  }, [user?.userId]);

  // Monitor checked-in event for completion and auto-checkout
  useEffect(() => {
    if (!user?.userId || !checkedInEvent) return;

    console.log('[EventCheckIn] Monitoring event for completion:', checkedInEvent.id);

    const checkEventCompletion = async () => {
      try {
        const { data: event } = await client.models.LiveEvent.get({ id: checkedInEvent.id });

        if (event && (event.status === 'FINISHED' || event.status === 'CANCELLED')) {
          console.log('[EventCheckIn] Event has ended, performing auto-checkout');

          // Get the user's check-in record
          const result = await getUserCheckedInEvent(user.userId);
          if (result) {
            // Actually check out (update database)
            await checkOutOfEvent(user.userId, result.checkIn.id);
            console.log('[EventCheckIn] Auto-checkout successful');
          }

          // Clear local state
          setCheckedInEvent(null);

          // Optional: Show notification
          // showAlert('Event Ended', 'You have been automatically checked out.');
        }
      } catch (error) {
        console.error('[EventCheckIn] Error during auto-checkout:', error);
      }
    };

    // Check immediately
    checkEventCompletion();

    // Check every 2 minutes (less aggressive than before)
    const interval = setInterval(checkEventCompletion, 120000);

    return () => {
      console.log('[EventCheckIn] Cleaning up event completion monitor');
      clearInterval(interval);
    };
  }, [checkedInEvent, user?.userId]);

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
      console.error('[EventCheckIn] Error fetching checked-in event:', error);
    }
  };

  const fetchNearbyEventsCount = async () => {
    try {
      // Fetch live events count using cache service (uses activeEventsByTime GSI)
      const liveEvents = await getLiveEventsFromCache();
      setNearbyEventsCount(liveEvents.length);
    } catch (error) {
      console.error('[EventCheckIn] Error fetching nearby events count:', error);
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
      }
    } catch (error) {
      console.error('[EventCheckIn] Error checking out:', error);
      showAlert('Error', 'Failed to check out. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckInSuccess = (event: LiveEvent) => {
    // Update local state immediately for instant UI feedback
    setCheckedInEvent(event);
    // Close modal
    setShowEventDiscovery(false);
    // Refresh nearby events count
    fetchNearbyEventsCount();
  };

  const value: EventCheckInContextType = {
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

  return (
    <EventCheckInContext.Provider value={value}>
      {children}
    </EventCheckInContext.Provider>
  );
};

export const useEventCheckIn = (): EventCheckInContextType => {
  const context = useContext(EventCheckInContext);
  if (context === undefined) {
    throw new Error('useEventCheckIn must be used within an EventCheckInProvider');
  }
  return context;
};
