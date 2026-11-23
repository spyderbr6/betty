import { describe, expect, it } from 'vitest';
import { depositFailedNotice, proPaymentJustFailed } from '../notifyLogic';

describe('proPaymentJustFailed', () => {
  it('is true only on the move into PAST_DUE', () => {
    expect(proPaymentJustFailed('ACTIVE', 'PAST_DUE')).toBe(true);
    expect(proPaymentJustFailed(null, 'PAST_DUE')).toBe(true);
    // Stripe sends an update per retry of the charge: those are not news
    expect(proPaymentJustFailed('PAST_DUE', 'PAST_DUE')).toBe(false);
    expect(proPaymentJustFailed('PAST_DUE', 'ACTIVE')).toBe(false);
    expect(proPaymentJustFailed('ACTIVE', 'CANCELLED')).toBe(false);
    expect(proPaymentJustFailed('INCOMPLETE', 'ACTIVE')).toBe(false);
  });
});

describe('depositFailedNotice', () => {
  it('names the amount and Stripe\'s reason, and says nothing was charged', () => {
    expect(
      depositFailedNotice({
        metadata: { userId: 'u-1', depositAmountCents: '2500' },
        last_payment_error: { message: 'Your card was declined.' },
      })
    ).toEqual({
      userId: 'u-1',
      title: 'Deposit Failed',
      message: "Your card deposit of $25.00 didn't go through: Your card was declined. You were not charged.",
    });
  });

  it('reads without a reason', () => {
    expect(depositFailedNotice({ metadata: { userId: 'u-1', depositAmountCents: '1000' } })?.message).toBe(
      "Your card deposit of $10.00 didn't go through. You were not charged."
    );
  });

  it('ignores PaymentIntents that are not deposits', () => {
    expect(depositFailedNotice({ metadata: {} })).toBeNull();
    expect(depositFailedNotice({ metadata: { userId: 'u-1' } })).toBeNull();
    expect(depositFailedNotice({ metadata: null })).toBeNull();
  });
});
