import { describe, expect, it } from 'vitest';
import {
  DEVICE_RETENTION_DAYS,
  deviceExpiresAt,
  deviceIdFor,
  rowsToRelease,
  transportFor,
  validateRegistration,
} from '../deviceLogic';

describe('validateRegistration', () => {
  const ok = { installationId: 'inst-abc123-xyz', token: 'ExponentPushToken[abc]', platform: 'ANDROID' };

  it('accepts a well-formed registration', () => {
    expect(validateRegistration(ok)).toBeNull();
  });

  it('rejects a missing or malformed installation id', () => {
    expect(validateRegistration({ ...ok, installationId: '' })).toMatch(/installationId/);
    expect(validateRegistration({ ...ok, installationId: 'has#hash-in-it' })).toMatch(/installationId/);
  });

  it('rejects a missing or oversized token', () => {
    expect(validateRegistration({ ...ok, token: null })).toMatch(/token/);
    expect(validateRegistration({ ...ok, token: 'x'.repeat(2049) })).toMatch(/token/);
  });

  it('rejects an unknown platform', () => {
    expect(validateRegistration({ ...ok, platform: 'WINDOWS_PHONE' })).toMatch(/platform/);
  });
});

describe('device identity', () => {
  it('derives one stable id per user and installation', () => {
    expect(deviceIdFor('user-1', 'inst-a')).toBe('user-1#inst-a');
    expect(deviceIdFor('user-1', 'inst-a')).toBe(deviceIdFor('user-1', 'inst-a'));
    expect(deviceIdFor('user-2', 'inst-a')).not.toBe(deviceIdFor('user-1', 'inst-a'));
  });

  it('sends web devices through Web Push and everything else through Expo', () => {
    expect(transportFor('WEB')).toBe('WEBPUSH');
    expect(transportFor('ANDROID')).toBe('EXPO');
    expect(transportFor('IOS')).toBe('EXPO');
  });

  it('expires a device 120 days after it was last seen, in epoch seconds', () => {
    const now = new Date('2026-10-01T00:00:00.500Z');
    expect(DEVICE_RETENTION_DAYS).toBe(120);
    expect(deviceExpiresAt(now)).toBe(Date.parse('2026-10-01T00:00:00Z') / 1000 + 120 * 86400);
  });
});

describe('rowsToRelease', () => {
  it("deactivates another user's active row for the same token, but not the kept row", () => {
    const rows = [
      { id: 'user-1#inst-a', isActive: true },
      { id: 'user-2#inst-a', isActive: true },
      { id: 'user-3#inst-a', isActive: false },
    ];
    expect(rowsToRelease(rows, 'user-1#inst-a')).toEqual(['user-2#inst-a']);
  });

  it('handles no rows', () => {
    expect(rowsToRelease(null, 'x')).toEqual([]);
  });
});
