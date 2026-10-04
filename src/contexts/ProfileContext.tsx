/**
 * Profile Context
 *
 * The signed-in user's User record, loaded once and kept live, for everything that shows
 * it: the header balance on every tab, the Account screen, the Wallet.
 *
 * Before this, each mounted header loaded the record and opened three subscriptions of
 * its own, the Account screen loaded it again, and AuthContext's copy of the display
 * name, picture and subscription went stale until the next sign-in or app resume. Now
 * there is one read and one set of subscriptions, and changes are copied into
 * AuthContext through patchUser.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { fetchUserAttributes } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { useAuth } from './AuthContext';
import { ensureUserRecord, type UserRecord } from '../services/userRecordService';
import { profileRepairs } from '../services/userRecordLogic';

const client = generateClient<Schema>();

interface ProfileContextValue {
  /** The live User record; null until loaded, or when there is none. */
  profile: UserRecord | null;
  balance: number;
  /** True only until the first load finishes. Later loads update in place. */
  isLoading: boolean;
  /** Re-read the record, creating it if it is missing. */
  refresh: () => Promise<void>;
  /** Merge fields this device has just written, without waiting for the subscription. */
  applyUpdate: (fields: Partial<UserRecord>) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, patchUser } = useAuth();
  const userId = user?.userId;
  const username = user?.username;
  const [profile, setProfile] = useState<UserRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Repairs run once per sign-in, not on every load
  const repairedForRef = useRef<string | null>(null);

  // Copy the fields AuthContext also holds, so its consumers see changes immediately
  const syncAuth = useCallback(
    (record: Partial<UserRecord> | null) => {
      if (!record) return;
      const fields: Parameters<typeof patchUser>[0] = {};
      if ('displayName' in record) fields.displayName = record.displayName ?? undefined;
      if ('profilePictureUrl' in record) fields.profilePictureUrl = record.profilePictureUrl ?? undefined;
      if ('subscriptionTier' in record && record.subscriptionTier) {
        fields.subscriptionTier = record.subscriptionTier;
      }
      if ('subscriptionStatus' in record && record.subscriptionStatus) {
        fields.subscriptionStatus = record.subscriptionStatus;
      }
      patchUser(fields);
    },
    [patchUser]
  );

  const load = useCallback(async () => {
    if (!userId || !username) return;
    try {
      // Creates the record if it is missing: the in-session retry for a create that failed
      // at sign-in (AuthContext makes the first attempt).
      let record = await ensureUserRecord({ userId, username });

      if (record && repairedForRef.current !== userId) {
        repairedForRef.current = userId;
        const attributes = await fetchUserAttributes().catch(() => ({}));
        const repairs = profileRepairs(record, attributes, username);
        if (repairs) {
          const { data: repaired } = await client.models.User.update({ id: userId, ...repairs });
          if (repaired) record = repaired as UserRecord;
        }
      }

      setProfile(record);
      syncAuth(record);
    } catch (error) {
      console.error('[Profile] Failed to load profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, username, syncAuth]);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setIsLoading(true);
      repairedForRef.current = null;
      return;
    }

    load();

    const onError = (label: string) => (error: unknown) =>
      console.error(`[Profile] ${label} subscription error:`, error);

    const subscriptions = [
      client.models.User.onUpdate({ filter: { id: { eq: userId } } }).subscribe({
        next: (updated) => {
          if (!updated) return;
          // A subscription delivers only the fields its mutation selected; keep what we
          // already have for anything missing
          setProfile((current) => ({ ...(current ?? {}), ...stripUndefined(updated) }) as UserRecord);
          syncAuth(stripUndefined(updated) as Partial<UserRecord>);
        },
        error: onError('user'),
      }),
      // A join or a refund changes the balance through writes this client does not always
      // see as a User update first, so re-read rather than guess.
      client.models.Participant.onCreate({ filter: { userId: { eq: userId } } }).subscribe({
        next: () => load(),
        error: onError('participant create'),
      }),
      client.models.Participant.onUpdate({ filter: { userId: { eq: userId } } }).subscribe({
        next: () => load(),
        error: onError('participant update'),
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
    };
  }, [userId, load, syncAuth]);

  const applyUpdate = useCallback(
    (fields: Partial<UserRecord>) => {
      setProfile((current) => (current ? ({ ...current, ...fields } as UserRecord) : current));
      syncAuth(fields);
    },
    [syncAuth]
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        balance: profile?.balance ?? 0,
        isLoading,
        refresh: load,
        applyUpdate,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
