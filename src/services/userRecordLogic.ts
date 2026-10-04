/**
 * Decision logic for ensureUserRecord (userRecordService.ts), kept free of Amplify imports
 * so it can be unit tested. The service wires in the real data client.
 */

export interface UserRecordDeps<R> {
  /** Read the record; resolves null when it does not exist, throws when the read fails. */
  get: (userId: string) => Promise<R | null>;
  /** Create the record; resolves null (with errors) when the API rejects it. */
  create: (input: Record<string, unknown>) => Promise<{ data: R | null; errors?: unknown }>;
  /** Cognito name and email, for the new record's display name and address. */
  fetchAttributes: () => Promise<{ name?: string; email?: string }>;
  createDefaultPreferences: (userId: string) => Promise<unknown>;
  tosVersion: string;
  privacyVersion: string;
  now?: () => string;
}

/**
 * Return the user's record, creating it if it does not exist.
 *
 * Returns null when there is still no record after trying (the create was rejected and
 * nobody else created it). A failed first read throws, so callers can tell "could not
 * reach the API" from "no record".
 */
export async function ensureUserRecordWith<R>(
  deps: UserRecordDeps<R>,
  params: { userId: string; username: string }
): Promise<R | null> {
  const { userId, username } = params;

  const existing = await deps.get(userId);
  if (existing) return existing;

  console.log('[UserRecord] No User record found, creating one for:', userId);

  let displayName = '';
  let email = username;
  try {
    const attributes = await deps.fetchAttributes();
    displayName = attributes.name || '';
    email = attributes.email || username;
  } catch (error) {
    console.warn('[UserRecord] Could not fetch Cognito user attributes:', error);
  }

  const now = (deps.now ?? (() => new Date().toISOString()))();
  try {
    // Policy acceptance is true for every new user: SignUp requires the checkboxes before
    // the Cognito account exists.
    const { data: created, errors } = await deps.create({
      id: userId,
      username,
      email,
      displayName: displayName || undefined,
      displayNameLower: displayName ? displayName.toLowerCase() : undefined,
      balance: 0,
      trustScore: 5.0,
      totalBets: 0,
      totalWinnings: 0,
      winRate: 0,
      tosAccepted: true,
      tosAcceptedAt: now,
      tosVersion: deps.tosVersion,
      privacyPolicyAccepted: true,
      privacyPolicyAcceptedAt: now,
      privacyPolicyVersion: deps.privacyVersion,
    });

    if (created) {
      try {
        await deps.createDefaultPreferences(userId);
      } catch (prefError) {
        console.warn('[UserRecord] Failed to create notification preferences:', prefError);
      }
      return created;
    }

    // The data client reports most failures here rather than by throwing. The usual one
    // is a conditional-check failure because another caller created the record first,
    // which the read below resolves.
    console.warn('[UserRecord] Create returned no record:', errors);
  } catch (error) {
    console.warn('[UserRecord] Create failed:', error);
  }

  // Lost a race with a concurrent create (AuthContext and AccountScreen can both get here
  // at sign-in), or the create was rejected: read once more either way.
  try {
    const raced = await deps.get(userId);
    if (!raced) console.error('[UserRecord] Still no User record after create for:', userId);
    return raced ?? null;
  } catch (error) {
    console.error('[UserRecord] Re-read after failed create failed:', error);
    return null;
  }
}
