import { describe, expect, it } from 'vitest';
import { disputeRefusalMessage } from '../disputeLogic';

describe('disputeRefusalMessage', () => {
  it('explains each refusal', () => {
    expect(disputeRefusalMessage('NOT_ADMIN')).toContain('admins group');
    expect(disputeRefusalMessage('ALREADY_PAID')).toContain('already been paid out');
    expect(disputeRefusalMessage('NOT_OPEN')).toContain('already been resolved');
  });

  it('falls back for a failed call', () => {
    expect(disputeRefusalMessage(undefined)).toBe('Failed to resolve dispute. Please try again.');
  });
});
