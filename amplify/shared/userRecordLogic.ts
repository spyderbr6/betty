/**
 * Creating a user's own User record, on the server (docs/SECURITY_PLAN.md step 3f).
 *
 * The app created it itself, with whatever balance, role and trust score it sent: any
 * signed-in user could create their record with $1000 or as ADMIN. Here the server writes
 * the caller's own record (its id is the caller's Cognito sub) with the money and
 * role fields fixed, and takes only display details from the app. The app's guard around
 * it (read, create if missing, read again after a lost race) is unchanged
 * (src/services/userRecordLogic.ts); this replaces only the create.
 *
 * Pure, so it is unit tested; the money function reads and writes through AppSync.
 */

export interface NewUserRecordArgs {
  email?: string | null;
  displayName?: string | null;
  tosVersion?: string | null;
  privacyVersion?: string | null;
}

export type EnsureUserRecordResult = { status: 'created' | 'exists' } | { status: 'refused'; reason: 'INVALID' };

const clip = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

/**
 * The record to create. Everything that carries value is fixed here: balance 0, the
 * default trust score, no stats, role USER. Policy acceptance is true, as the app records
 * it: sign-up requires the boxes before the Cognito account exists.
 */
export function newUserRecord(params: {
  userId: string;
  username: string;
  args: NewUserRecordArgs;
  now: string;
}): Record<string, unknown> {
  const { userId, username, args, now } = params;
  const displayName = clip(args.displayName, 100);
  const email = clip(args.email, 320) ?? username;
  const record: Record<string, unknown> = {
    // id is the caller's Cognito sub. There is no owner field: AppSync sets one only for
    // user-pool callers and does not accept it from the server, so the step 5 rules must
    // define User ownership by id (allow.ownerDefinedIn('id')), not by the owner field.
    id: userId,
    username,
    email,
    balance: 0,
    trustScore: 5.0,
    totalBets: 0,
    totalWinnings: 0,
    winRate: 0,
    role: 'USER',
    tosAccepted: true,
    tosAcceptedAt: now,
    tosVersion: clip(args.tosVersion, 40) ?? 'unknown',
    privacyPolicyAccepted: true,
    privacyPolicyAcceptedAt: now,
    privacyPolicyVersion: clip(args.privacyVersion, 40) ?? 'unknown',
  };
  if (displayName) {
    record.displayName = displayName;
    record.displayNameLower = displayName.toLowerCase();
  }
  return record;
}
