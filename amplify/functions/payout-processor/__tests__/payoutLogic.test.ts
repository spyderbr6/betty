import { describe, expect, it } from 'vitest';
import { isReadyForPayout, payoutSkipReason, type PayoutCandidate } from '../payoutLogic';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const HOUR = 3_600_000;

const candidate = (over: Partial<PayoutCandidate> = {}): PayoutCandidate => ({
  winningSide: 'A',
  disputeWindowEndsAt: new Date(NOW.getTime() - HOUR).toISOString(),
  hasNonCreatorParticipants: true,
  ...over,
});

describe('isReadyForPayout', () => {
  it('pays out once the dispute window has closed', () => {
    expect(isReadyForPayout(candidate(), NOW)).toBe(true);
  });

  it('waits while the dispute window is still open', () => {
    const open = candidate({ disputeWindowEndsAt: new Date(NOW.getTime() + HOUR).toISOString() });
    expect(isReadyForPayout(open, NOW)).toBe(false);
    expect(payoutSkipReason(open, NOW)).toBe('dispute window still open');
  });

  it('skips the dispute window when nobody else has a stake', () => {
    // No one else could file a dispute, so there is nothing to wait for.
    const soloResolved = candidate({
      hasNonCreatorParticipants: false,
      disputeWindowEndsAt: new Date(NOW.getTime() + HOUR).toISOString(),
    });
    expect(isReadyForPayout(soloResolved, NOW)).toBe(true);
  });

  /**
   * The regression this module exists for.
   *
   * A creator-only bet that ran out its timer reached PENDING_RESOLUTION with no
   * winningSide. The old condition asked only whether anyone could dispute, said
   * yes-pay-it-now, found no pending payout transactions, and marked the bet
   * RESOLVED - with the creator's stake deducted and nothing returned, and no
   * resolution prompt left in the UI to recover it.
   */
  it('never pays out a bet that nobody has resolved', () => {
    const unresolved = candidate({ winningSide: null, disputeWindowEndsAt: null });
    expect(isReadyForPayout(unresolved, NOW)).toBe(false);
    expect(payoutSkipReason(unresolved, NOW)).toBe('not resolved yet - no winning side chosen');
  });

  it('never pays out an unresolved creator-only bet, however old', () => {
    const soloExpired = candidate({
      winningSide: null,
      disputeWindowEndsAt: null,
      hasNonCreatorParticipants: false,
    });
    expect(isReadyForPayout(soloExpired, NOW)).toBe(false);
  });

  it('treats an empty winning side as unresolved', () => {
    expect(isReadyForPayout(candidate({ winningSide: '' }), NOW)).toBe(false);
    expect(isReadyForPayout(candidate({ winningSide: undefined }), NOW)).toBe(false);
  });

  it('holds a resolved bet whose window has not been reached yet', () => {
    const justResolved = candidate({
      disputeWindowEndsAt: new Date(NOW.getTime() + 48 * HOUR).toISOString(),
    });
    expect(isReadyForPayout(justResolved, NOW)).toBe(false);
  });
});
