import { describe, expect, it, vi } from 'vitest';
import { ensureUserRecordWith, type UserRecordDeps } from '../userRecordLogic';

type Rec = { id: string; tag?: string };

const USER = { userId: 'u-1', username: 'cognito-user' };

/** Deps backed by an in-memory table; `over` replaces any of them. */
const deps = (over: Partial<UserRecordDeps<Rec>> = {}, table = new Map<string, Rec>()) => {
  const d: UserRecordDeps<Rec> = {
    get: vi.fn(async (id: string) => table.get(id) ?? null),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const rec = { id: input.id as string };
      table.set(rec.id, rec);
      return { data: rec };
    }),
    fetchAttributes: vi.fn(async () => ({ name: 'Dana Smith', email: 'dana@example.org' })),
    createDefaultPreferences: vi.fn(async () => undefined),
    tosVersion: 'tos-v',
    privacyVersion: 'pp-v',
    now: () => '2026-10-03T00:00:00.000Z',
    ...over,
  };
  return { d, table };
};

describe('ensureUserRecordWith', () => {
  it('returns an existing record without creating anything', async () => {
    const { d } = deps({}, new Map([['u-1', { id: 'u-1', tag: 'existing' }]]));

    await expect(ensureUserRecordWith(d, USER)).resolves.toEqual({ id: 'u-1', tag: 'existing' });
    expect(d.create).not.toHaveBeenCalled();
    expect(d.createDefaultPreferences).not.toHaveBeenCalled();
  });

  it('creates a missing record from the Cognito attributes, with preferences', async () => {
    const { d } = deps();

    await expect(ensureUserRecordWith(d, USER)).resolves.toEqual({ id: 'u-1' });
    expect(d.create).toHaveBeenCalledOnce();
    expect(d.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'u-1',
        username: 'cognito-user',
        email: 'dana@example.org',
        displayName: 'Dana Smith',
        // Friend search reads this; one of the two old copies of this create omitted it
        displayNameLower: 'dana smith',
        balance: 0,
        tosAccepted: true,
        tosVersion: 'tos-v',
        privacyPolicyAccepted: true,
        privacyPolicyVersion: 'pp-v',
      })
    );
    expect(d.createDefaultPreferences).toHaveBeenCalledWith('u-1');
  });

  it('falls back to the username when Cognito attributes cannot be read', async () => {
    const { d } = deps({ fetchAttributes: vi.fn(async () => { throw new Error('offline'); }) });

    await ensureUserRecordWith(d, USER);
    expect(d.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'cognito-user', displayName: undefined, displayNameLower: undefined })
    );
  });

  it('returns the record another caller created when its own create loses the race', async () => {
    const table = new Map<string, Rec>();
    const { d } = deps(
      {
        // The concurrent caller's record lands; this create is rejected, as the data
        // client reports a conditional-check failure: no data, errors, no throw.
        create: vi.fn(async () => {
          table.set('u-1', { id: 'u-1', tag: 'theirs' });
          return { data: null, errors: [{ errorType: 'ConditionalCheckFailedException' }] };
        }),
      },
      table
    );

    await expect(ensureUserRecordWith(d, USER)).resolves.toEqual({ id: 'u-1', tag: 'theirs' });
    expect(d.createDefaultPreferences).not.toHaveBeenCalled();
  });

  it('re-reads after a create that throws', async () => {
    const table = new Map<string, Rec>();
    const { d } = deps(
      {
        create: vi.fn(async () => {
          table.set('u-1', { id: 'u-1', tag: 'theirs' });
          throw new Error('network');
        }),
      },
      table
    );

    await expect(ensureUserRecordWith(d, USER)).resolves.toEqual({ id: 'u-1', tag: 'theirs' });
  });

  it('returns null, not a throw, when the create is rejected and nothing exists', async () => {
    const { d } = deps({ create: vi.fn(async () => ({ data: null, errors: ['denied'] })) });

    await expect(ensureUserRecordWith(d, USER)).resolves.toBeNull();
    expect(d.get).toHaveBeenCalledTimes(2);
  });

  it('lets a failed first read throw, so callers can tell an outage from a missing record', async () => {
    const { d } = deps({ get: vi.fn(async () => { throw new Error('offline'); }) });

    await expect(ensureUserRecordWith(d, USER)).rejects.toThrow('offline');
    expect(d.create).not.toHaveBeenCalled();
  });

  it('still returns the new record when creating preferences fails', async () => {
    const { d } = deps({ createDefaultPreferences: vi.fn(async () => { throw new Error('prefs'); }) });

    await expect(ensureUserRecordWith(d, USER)).resolves.toEqual({ id: 'u-1' });
  });
});
