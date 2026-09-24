/**
 * Rules about when a squares game may be cancelled.
 *
 * Its own module with no Amplify import, so it can be unit tested.
 * squaresGameService configures a client at module scope, which makes it
 * unimportable from a test - the same reason the Lambda decision logic lives in
 * payoutLogic.ts and expiryLogic.ts.
 */

export interface ExistingPayout {
  period?: string | null;
}

/**
 * Why a cancellation must be refused, or null if it may proceed.
 *
 * Cancelling refunds every stake in full. Doing that after a period has already
 * paid out distributes the same money twice: the winner keeps the payout and
 * gets their stake back, funded by stakes that have already been handed out. A
 * part-played game needs its remaining period scores entered, not a refund.
 */
export function cancelRefusalReason(
  payouts: ExistingPayout[] | null | undefined
): string | null {
  const paid = payouts ?? [];
  if (paid.length === 0) return null;

  const periods = paid
    .map((payout) => payout.period)
    .filter(Boolean)
    .join(', ');

  return (
    `Cannot cancel: ${paid.length} period(s) already paid out` +
    (periods ? ` (${periods})` : '') +
    '. Refunding now would pay those winners twice. Enter the remaining period ' +
    'scores instead.'
  );
}
