/**
 * User Record Service
 *
 * The one place the app creates a user's User record. Nothing server-side does it (there
 * is no post-confirmation trigger), so the client has to, and it has to be reliable:
 * onboarding, balances and every profile screen write to this record and fail silently
 * when it is missing.
 *
 * Called from AuthContext on every auth check, and from AccountScreen when its own read
 * finds no record, so a create that failed at sign-in is retried within the same session
 * rather than waiting for the next sign-in, token refresh or app resume. The logic lives
 * in userRecordLogic.ts, which is unit tested.
 */

import { generateClient } from 'aws-amplify/data';
import { fetchUserAttributes } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import { CURRENT_TOS_VERSION, CURRENT_PRIVACY_VERSION } from '../constants/policies';
import { NotificationPreferencesService } from './notificationPreferencesService';
import { ensureUserRecordWith } from './userRecordLogic';

const client = generateClient<Schema>();

export type UserRecord = Schema['User']['type'];

// Untyped handle on the model, looked up per call: client.models is only populated once
// Amplify.configure has run, which is after this module loads. It is untyped because
// inferring User.get/create here trips TS2590 ("union type too complex"), the same error
// several services hit; the public signature below keeps callers typed.
const userModel = () => client.models.User as any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function ensureUserRecord(params: {
  userId: string;
  username: string;
}): Promise<UserRecord | null> {
  return ensureUserRecordWith<UserRecord>(
    {
      get: async (id) => (await userModel().get({ id })).data ?? null,
      create: (input) => userModel().create(input),
      fetchAttributes: () => fetchUserAttributes(),
      createDefaultPreferences: (id) => NotificationPreferencesService.createDefaultPreferences(id),
      tosVersion: CURRENT_TOS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
    params
  );
}
