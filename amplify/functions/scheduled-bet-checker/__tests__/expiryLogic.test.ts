import { describe, expect, it } from 'vitest';
import { decideExpiry, type ExpiredParticipant } from '../expiryLogic';

const CREATOR = 'user-creator';
const participant = (over: Partial<ExpiredParticipant> = {}): ExpiredParticipant => ({
  id: 'participant-1',
  userId: CREATOR,
  amount: 25,
  ...over,
});

describe('decideExpiry', () => {
  it('sends a bet with an opponent to resolution', () => {
    const outcome = decideExpiry(CREATOR, [
      participant(),
      participant({ id: 'participant-2', userId: 'user-other' }),
    ]);
    expect(outcome.action).toBe('RESOLVE');
  });

  /**
   * The regression this module exists for.
   *
   * The creator is written as a Participant when the bet is created, so the old
   * check - "are there any participants?" - was true for every bet, and the
   * cancellation branch behind it was unreachable. A creator-only bet went to
   * PENDING_RESOLUTION, and the payout processor then marked it RESOLVED with no
   * winner and no refund.
   */
  it('cancels and refunds when only the creator ever staked', () => {
    const outcome = decideExpiry(CREATOR, [participant()]);
    expect(outcome.action).toBe('CANCEL');
    if (outcome.action !== 'CANCEL') return;
    expect(outcome.refunds).toEqual([
      { participantId: 'participant-1', userId: CREATOR, amount: 25 },
    ]);
  });

  it('cancels a bet nobody joined at all', () => {
    const outcome = decideExpiry(CREATOR, []);
    expect(outcome.action).toBe('CANCEL');
    if (outcome.action !== 'CANCEL') return;
    expect(outcome.refunds).toEqual([]);
  });

  it('treats a missing participant list as nobody joined', () => {
    expect(decideExpiry(CREATOR, null).action).toBe('CANCEL');
    expect(decideExpiry(CREATOR, undefined).action).toBe('CANCEL');
  });

  it('refunds every stake, not just the creatoric one', () => {
    // Defensive: a bet cannot currently reach CANCEL with more than the creator
    // staked, but the rule is "return what was staked", not "return one stake".
    const outcome = decideExpiry(CREATOR, [
      participant({ id: 'p1', amount: 25 }),
      participant({ id: 'p2', amount: 10 }),
    ]);
    expect(outcome.action).toBe('CANCEL');
    if (outcome.action !== 'CANCEL') return;
    expect(outcome.refunds.map((r) => r.amount)).toEqual([25, 10]);
  });

  it('skips rows that cannot be refunded', () => {
    const outcome = decideExpiry(CREATOR, [
      participant({ id: null }),
      participant({ id: 'p2', userId: null }),
      participant({ id: 'p3', amount: 0 }),
      participant({ id: 'p4', amount: 25 }),
    ]);
    expect(outcome.action).toBe('CANCEL');
    if (outcome.action !== 'CANCEL') return;
    expect(outcome.refunds).toEqual([{ participantId: 'p4', userId: CREATOR, amount: 25 }]);
  });

  it('does not treat a null creator as its own opponent', () => {
    // A participant with a real userId is an opponent when creatorId is missing,
    // rather than silently matching it.
    const outcome = decideExpiry(null, [participant({ userId: 'user-other' })]);
    expect(outcome.action).toBe('RESOLVE');
  });
});
