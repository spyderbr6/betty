import { describe, expect, it } from 'vitest';
import { WINNINGS_FEE_RATE, netWinnings, winningsFee } from '../subscriptionConfig';

/**
 * The fee on winnings, which Pro waives.
 *
 * Three call sites used to compute this inline and none of them asked whether the
 * winner was Pro: ResolveScreen hardcoded 0.03 twice (once for the transaction,
 * once for the notification text), squaresGameService used the rate constant
 * behind a comment saying Pro was handled elsewhere, and the squares Lambda
 * hardcoded it again. Pro members were charged on every bet and square they won.
 */
describe('winningsFee', () => {
  it('charges the configured rate for a free member', () => {
    expect(winningsFee(100, false)).toBe(100 * WINNINGS_FEE_RATE);
  });

  it('waives the fee entirely for Pro', () => {
    expect(winningsFee(100, true)).toBe(0);
    expect(netWinnings(100, true)).toBe(100);
  });

  it('rounds to the cent rather than carrying fractions', () => {
    // 33.33 * 0.03 = 0.9999 — must not become a sub-cent balance.
    expect(winningsFee(33.33, false)).toBe(1);
  });

  it('never charges on a zero or negative payout', () => {
    expect(winningsFee(0, false)).toBe(0);
    expect(winningsFee(-10, false)).toBe(0);
  });

  it('nets out to the gross amount minus the fee', () => {
    expect(netWinnings(100, false)).toBe(97);
    expect(netWinnings(50, false)).toBe(48.5);
  });

  it('keeps net and fee consistent across awkward amounts', () => {
    for (const gross of [0.01, 1.005, 12.34, 99.99, 1234.56]) {
      for (const isPro of [true, false]) {
        const net = netWinnings(gross, isPro);
        const fee = winningsFee(gross, isPro);
        expect(Math.round((net + fee) * 100) / 100).toBe(Math.round(gross * 100) / 100);
      }
    }
  });
});
