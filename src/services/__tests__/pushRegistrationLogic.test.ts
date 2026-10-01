import { describe, expect, it } from 'vitest';
import { describeUserAgent, planTokenUpsert, rowsForDeviceSignOut, TOKEN_TOUCH_INTERVAL_MS } from '../pushRegistrationLogic';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const recent = new Date(NOW.getTime() - 60_000).toISOString();
const old = new Date(NOW.getTime() - TOKEN_TOUCH_INTERVAL_MS - 1).toISOString();

describe('planTokenUpsert', () => {
  it('creates a row when no row holds the token', () => {
    const plan = planTokenUpsert([{ id: 'a', token: 'other', isActive: true }], 'tok', NOW);
    expect(plan).toEqual({ create: true, touchKept: false, deactivateIds: [] });
  });

  it('keeps an existing, recently used active row without writing', () => {
    const plan = planTokenUpsert([{ id: 'a', token: 'tok', isActive: true, lastUsed: recent }], 'tok', NOW);
    expect(plan).toEqual({ create: false, keepId: 'a', touchKept: false, deactivateIds: [] });
  });

  it('touches the kept row once it goes stale', () => {
    const plan = planTokenUpsert([{ id: 'a', token: 'tok', isActive: true, lastUsed: old }], 'tok', NOW);
    expect(plan.touchKept).toBe(true);
  });

  it('re-activates an inactive row rather than creating a new one', () => {
    const plan = planTokenUpsert([{ id: 'a', token: 'tok', isActive: false, lastUsed: recent }], 'tok', NOW);
    expect(plan).toEqual({ create: false, keepId: 'a', touchKept: true, deactivateIds: [] });
  });

  it('collapses duplicate active rows for the same token down to one', () => {
    const plan = planTokenUpsert(
      [
        { id: 'older', token: 'tok', isActive: true, lastUsed: old },
        { id: 'newest', token: 'tok', isActive: true, lastUsed: recent },
        { id: 'dead', token: 'tok', isActive: false, lastUsed: recent },
        { id: 'other-device', token: 'x', isActive: true, lastUsed: recent },
      ],
      'tok',
      NOW
    );
    expect(plan.keepId).toBe('newest');
    expect(plan.deactivateIds).toEqual(['older']);
    expect(plan.create).toBe(false);
  });

  it('prefers an active row over a more recently used inactive one', () => {
    const plan = planTokenUpsert(
      [
        { id: 'inactive', token: 'tok', isActive: false, lastUsed: recent },
        { id: 'active', token: 'tok', isActive: true, lastUsed: old },
      ],
      'tok',
      NOW
    );
    expect(plan.keepId).toBe('active');
    expect(plan.deactivateIds).toEqual([]);
  });
});

describe('rowsForDeviceSignOut', () => {
  const rows = [
    { id: 'this-by-token', token: 'tok', isActive: true },
    { id: 'this-by-install', token: 'rotated', deviceId: 'install-1', isActive: true },
    { id: 'already-off', token: 'tok', isActive: false },
    { id: 'other-device', token: 'x', deviceId: 'install-2', isActive: true },
  ];

  it('deactivates only this device, matched by token or installation id', () => {
    expect(rowsForDeviceSignOut(rows, { token: 'tok', installationId: 'install-1' })).toEqual([
      'this-by-token',
      'this-by-install',
    ]);
  });

  it('matches nothing when the device has neither a token nor an installation id', () => {
    expect(rowsForDeviceSignOut(rows, {})).toEqual([]);
  });
});

describe('describeUserAgent', () => {
  const cases: [string, string][] = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox on Linux'],
    ['', 'Browser'],
  ];
  it.each(cases)('%s → %s', (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected);
  });
});
