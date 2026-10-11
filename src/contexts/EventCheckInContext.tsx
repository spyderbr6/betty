/**
 * EventCheckInContext
 * Global state management for event check-in with cache invalidation
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppState } from 'react-native';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { getUserCheckedInEvent, checkOutOfEvent } from '../services/eventService';
import { getLiveEventsFromCache } from '../services/eventCacheService';
import { isEventOver, toLiveEventData, type LiveEventRecord } from '../services/liveEventLogic';
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

  // Live updates for the checked-in game: one subscription to that game's row, which the
  // event-fetcher writes only when ESPN reports a change (score, clock or status). The
  // banner follows the score, and the user is checked out when the game ends. A phone in
  // the background drops the socket, so the game is also re-read when the app comes back.
  const checkedInEventId = checkedInEvent?.id;
  useEffect(() => {
    if (!user?.userId || !checkedInEventId) return;
    const userId = user.userId;
    let active = true;
    let checkingOut = false;

    console.log('[EventCheckIn] Following checked-in event:', checkedInEventId);

    const applyEvent = async (record: LiveEventRecord | null | undefined) => {
      if (!active || !record || record.id !== checkedInEventId) return;

      if (!isEventOver(record.status)) {
        setCheckedInEvent(toLiveEventData(record));
        return;
      }

      if (checkingOut) return;
      checkingOut = true;
      try {
        console.log('[EventCheckIn] Event has ended, performing auto-checkout');
        const result = await getUserCheckedInEvent(userId);
        if (result) {
          await checkOutOfEvent(userId, result.checkIn.id);
          console.log('[EventCheckIn] Auto-checkout successful');
        }
        if (active) setCheckedInEvent(null);
      } catch (error) {
        checkingOut = false;
        console.error('[EventCheckIn] Error during auto-checkout:', error);
      }
    };

    const reread = () => {
      client.models.LiveEvent.get({ id: checkedInEventId })
        .then(({ data }) => applyEvent(data))
        .catch((error: unknown) => console.error('[EventCheckIn] Error re-reading event:', error));
    };

    // The game may have changed, or ended, before the subscription opened
    reread();

    const subscription = client.models.LiveEvent.onUpdate({
      filter: { id: { eq: checkedInEventId } },
    }).subscribe({
      next: (record) => {
        applyEvent(record);
      },
      error: (error: unknown) => console.error('[EventCheckIn] LiveEvent onUpdate error:', error),
    });

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') reread();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      appState.remove();
    };
  }, [checkedInEventId, user?.userId]);

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
