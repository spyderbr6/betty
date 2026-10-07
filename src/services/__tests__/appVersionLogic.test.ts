import { describe, expect, it } from 'vitest';
import { compareVersions, isUpdateRequired } from '../appVersionLogic';

describe('compareVersions', () => {
  it('compares each part as a number, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
  });
});

describe('isUpdateRequired', () => {
  it('requires an update only below the minimum', () => {
    expect(isUpdateRequired('1.0.0', '1.1.0')).toBe(true);
    expect(isUpdateRequired('1.1.0', '1.1.0')).toBe(false);
    expect(isUpdateRequired('1.2.0', '1.1.0')).toBe(false);
  });

  it('lets the app through when the version or the minimum is unknown or malformed', () => {
    expect(isUpdateRequired(undefined, '1.1.0')).toBe(false);
    expect(isUpdateRequired('1.0.0', null)).toBe(false);
    expect(isUpdateRequired('1.0.0', '')).toBe(false);
    expect(isUpdateRequired('1.0.0', 'latest')).toBe(false);
  });
});
