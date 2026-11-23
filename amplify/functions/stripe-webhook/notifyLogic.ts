/**
 * What the Stripe webhook tells a user about money that did not arrive: a card deposit that
 * failed, and a Pro renewal Stripe could not charge.
 *
 * Kept apart from the handler so it is tested; the handler cannot be imported by a test.
 */

/**
 * Whether a subscription update means the Pro payment has just failed. Stripe sends an
 * update for every retry of the charge and for unrelated changes; only the move into
 * PAST_DUE is news. (The notification's id is also fixed per billing period, in case two
 * updates race past this check.)
 */
export function proPaymentJustFailed(previousStatus: string | null | undefined, nextStatus: string): boolean {
  return nextStatus === 'PAST_DUE' && previousStatus !== 'PAST_DUE';
}

export interface FailedPaymentIntent {
  metadata?: Record<string, string> | null;
  last_payment_error?: { message?: string | null } | null;
}

/** The notice for a failed card deposit, or null for a PaymentIntent that was not a deposit. */
export function depositFailedNotice(paymentIntent: FailedPaymentIntent): { userId: string; title: string; message: string } | null {
  const userId = paymentIntent.metadata?.userId;
  const cents = parseInt(paymentIntent.metadata?.depositAmountCents ?? '', 10);
  if (!userId || !Number.isFinite(cents)) return null;
  const reason = paymentIntent.last_payment_error?.message?.trim();
  return {
    userId,
    title: 'Deposit Failed',
    message:
      `Your card deposit of $${(cents / 100).toFixed(2)} didn't go through` +
      (reason ? `: ${reason.replace(/\.$/, '')}.` : '.') +
      ' You were not charged.',
  };
}

export const PRO_PAYMENT_FAILED_NOTICE = {
  title: 'Pro Payment Failed',
  message: "We couldn't charge your card for SideBet Pro. Update your payment method to keep Pro.",
};
