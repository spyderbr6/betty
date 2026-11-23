/**
 * Fixed ids for notifications that must be written once per event, however many times the
 * code that raises them runs: a scheduled checker that overlaps itself, a Stripe event
 * delivered twice. Creating a row whose id exists is refused by AppSync (a conditional
 * write), so the second writer gets an error that isDuplicate recognises and nothing else.
 *
 * Plain functions, no dependencies: bundled into Lambdas and unit tested.
 */

/** The creator's "pick the winner" notice, once per bet. */
export const resolutionNeededNotificationId = (betId: string) => `resolution-needed#${betId}`;

/** The reminder about an unanswered squares invitation, once per invitation. */
export const squaresReminderNotificationId = (invitationId: string) => `squares-reminder#${invitationId}`;

/** A failed card payment, once per Stripe event (Stripe may deliver an event more than once). */
export const stripeEventNotificationId = (stripeEventId: string) => `stripe#${stripeEventId}`;

/**
 * A failed Pro payment, once per subscription and billing period: Stripe sends several
 * subscription updates while it retries the charge, and each one would otherwise notify.
 */
export const proPaymentFailedNotificationId = (subscriptionId: string, periodEnd: string | null) =>
  `pro-payment-failed#${subscriptionId}#${periodEnd ?? 'unknown'}`;

/** True when a create was refused only because the row already exists. */
export function isDuplicate(errors: ReadonlyArray<{ errorType?: string; message?: string }> | null | undefined): boolean {
  return (
    !!errors?.length &&
    errors.every((e) => /ConditionalCheckFailed/i.test(e.errorType ?? '') || /conditional request failed/i.test(e.message ?? ''))
  );
}
