import { describe, expect, it } from 'vitest';
import { cancelRefusalReason } from '../cancelRules';

describe('cancelRefusalReason', () => {
  it('allows cancelling a game that has paid nothing out', () => {
    expect(cancelRefusalReason([])).toBeNull();
    expect(cancelRefusalReason(null)).toBeNull();
    expect(cancelRefusalReason(undefined)).toBeNull();
  });

  /**
   * Cancelling refunds every stake in full, so doing it after a payout hands the
   * same money out twice - the winner keeps the payout and gets their stake back,
   * funded by stakes already distributed.
   */
  it('refuses once any period has paid out', () => {
    const reason = cancelRefusalReason([{ period: 'Q1' }]);
    expect(reason).toContain('1 period(s) already paid out');
    expect(reason).toContain('Q1');
  });

  it('names every paid period so the admin knows what happened', () => {
    const reason = cancelRefusalReason([{ period: 'Q1' }, { period: 'Q2' }]);
    expect(reason).toContain('2 period(s)');
    expect(reason).toContain('Q1, Q2');
  });

  it('still refuses when the periods are unlabelled', () => {
    // A payout row with no period is still money out the door.
    expect(cancelRefusalReason([{ period: null }])).toContain('1 period(s)');
  });
});
