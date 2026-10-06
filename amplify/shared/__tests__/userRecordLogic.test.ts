import { describe, expect, it } from 'vitest';
import { newUserRecord } from '../userRecordLogic';

const NOW = '2026-10-06T12:00:00.000Z';

describe('newUserRecord', () => {
  it('creates the caller\'s own record, its id their sub', () => {
    const record = newUserRecord({ userId: 'sub-1', username: 'sub-1', args: { email: 'pat@example.org', displayName: ' Pat ' }, now: NOW });
    // AppSync does not accept owner from the server (see newUserRecord)
    expect(record).not.toHaveProperty('owner');
    expect(record).toMatchObject({ id: 'sub-1', username: 'sub-1', email: 'pat@example.org', displayName: 'Pat', displayNameLower: 'pat' });
  });

  it('fixes every field that carries value, whatever the app sends', () => {
    const record = newUserRecord({
      userId: 'sub-1',
      username: 'sub-1',
      // What a modified app might try: none of these are arguments the server reads
      args: { balance: 1000, role: 'ADMIN', trustScore: 10 } as never,
      now: NOW,
    });
    expect(record).toMatchObject({ balance: 0, trustScore: 5, totalBets: 0, totalWinnings: 0, winRate: 0, role: 'USER' });
  });

  it('records policy acceptance as sign-up does, with the versions given', () => {
    const record = newUserRecord({ userId: 'u', username: 'u', args: { tosVersion: '2026-09', privacyVersion: '2026-08' }, now: NOW });
    expect(record).toMatchObject({ tosAccepted: true, tosAcceptedAt: NOW, tosVersion: '2026-09', privacyPolicyAccepted: true, privacyPolicyVersion: '2026-08' });
  });

  it('falls back to the username for a missing email, and omits a blank display name', () => {
    const record = newUserRecord({ userId: 'u', username: 'name@example.org', args: { displayName: '  ' }, now: NOW });
    expect(record.email).toBe('name@example.org');
    expect(record).not.toHaveProperty('displayName');
  });
});
