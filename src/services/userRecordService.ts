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
      // The server creates the record (docs/SECURITY_PLAN.md step 3f): only for the caller,
      // with balance 0, the default trust score and role USER, whatever is sent. It used to
      // be a client User.create with every field the app chose. Only the display details
      // are passed; the record is then read back, so the guard in ensureUserRecordWith
      // (read, create, re-read after a lost race) works exactly as before.
      create: async (input) => {
        const { data, errors } = await client.mutations.ensureMyUserRecord({
          email: input.email as string | undefined,
          displayName: input.displayName as string | undefined,
          tosVersion: input.tosVersion as string | undefined,
          privacyVersion: input.privacyVersion as string | undefined,
        });
        if (errors?.length) return { data: null, errors };
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        if (result?.status !== 'created' && result?.status !== 'exists') return { data: null, errors: [result] };
        return { data: (await userModel().get({ id: input.id as string })).data ?? null };
      },
      fetchAttributes: () => fetchUserAttributes(),
      createDefaultPreferences: (id) => NotificationPreferencesService.createDefaultPreferences(id),
      tosVersion: CURRENT_TOS_VERSION,
      privacyVersion: CURRENT_PRIVACY_VERSION,
    },
    params
  );
}
