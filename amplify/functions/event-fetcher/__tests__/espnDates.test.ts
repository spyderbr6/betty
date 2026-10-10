import { describe, expect, it } from 'vitest';
import { espnDatesInRange, MAX_RANGE_DAYS } from '../espnDates';

describe('espnDatesInRange', () => {
  it('returns one ESPN day for a single date', () => {
    expect(espnDatesInRange('2026-10-10', '2026-10-10')).toEqual(['20261010']);
  });

  it('lists every day of the live window, ends included', () => {
    expect(espnDatesInRange('2026-10-09', '2026-10-11')).toEqual(['20261009', '20261010', '20261011']);
  });

  it('crosses month and year ends', () => {
    expect(espnDatesInRange('2026-12-30', '2027-01-02')).toEqual(['20261230', '20261231', '20270101', '20270102']);
  });

  it('is not shifted by daylight saving changes', () => {
    expect(espnDatesInRange('2026-11-01', '2026-11-02')).toEqual(['20261101', '20261102']);
    expect(espnDatesInRange('2026-03-08', '2026-03-09')).toEqual(['20260308', '20260309']);
  });

  it('never sends a range, which ESPN refuses', () => {
    for (const day of espnDatesInRange('2026-10-01', '2026-10-07')) {
      expect(day).toMatch(/^\d{8}$/);
    }
  });

  it('refuses reversed, malformed, impossible and over-long ranges', () => {
    expect(() => espnDatesInRange('2026-10-11', '2026-10-09')).toThrow(/before/);
    expect(() => espnDatesInRange('20261009', '2026-10-11')).toThrow(/YYYY-MM-DD/);
    expect(() => espnDatesInRange('2026-02-30', '2026-03-01')).toThrow(/real date/);
    expect(() => espnDatesInRange('2026-01-01', '2026-12-31')).toThrow(new RegExp(`${MAX_RANGE_DAYS} days`));
  });
});
