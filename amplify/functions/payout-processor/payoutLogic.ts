/**
 * Decision logic for the payout processor, kept separate from the handler so it
 * can be tested. The handler configures Amplify with a top-level await and
 * imports $amplify/env, neither of which exists in a test run.
 */

export interface PayoutCandidate {
  /** Which side won. Null until someone has actually resolved the bet. */
  winningSide?: string | null;
  /** Set when a creator resolves; starts the 48-hour dispute window. */
  disputeWindowEndsAt?: string | null;
  /** Whether anyone other than the creator has a stake in this bet. */
  hasNonCreatorParticipants: boolean;
}

/**
 * Whether a PENDING_RESOLUTION bet may be paid out.
 *
 * The winningSide check is the important one. A bet reaches PENDING_RESOLUTION
 * by two different routes: a creator resolving it, which sets winningSide and
 * opens the dispute window, or scheduled-bet-checker finding it past its
 * deadline with participants, which sets neither.
 *
 * The previous condition was `disputeWindowExpired || !hasNonCreatorParticipants`.
 * The second clause exists so a bet nobody else joined does not have to sit
 * through a dispute window that nobody could file in - but it was evaluated
 * before asking whether the bet had been resolved at all. So a creator-only bet
 * that simply ran out its timer was declared ready for payout with no winner
 * chosen, found no pending payout transactions, and was marked RESOLVED with the
 * creator's stake already deducted and nothing returned. The money was
 * unreachable: RESOLVED bets show no resolution prompt.
 *
 * Skipping the dispute window is a decision about *when* to pay. It cannot be a
 * decision about *whether* the bet was resolved.
 */
export function isReadyForPayout(bet: PayoutCandidate, now: Date = new Date()): boolean {
  // Nothing has been decided, so there is nothing to pay out.
  if (!bet.winningSide) return false;

  const disputeWindowExpired = Boolean(
    bet.disputeWindowEndsAt && new Date(bet.disputeWindowEndsAt) < now
  );

  // No one else has a stake, so there is no one who could dispute the outcome.
  return disputeWindowExpired || !bet.hasNonCreatorParticipants;
}

/**
 * Why a candidate was skipped, for the handler's logs. Callers should not branch
 * on this string; it exists so a skipped bet is explainable from CloudWatch.
 */
export function payoutSkipReason(bet: PayoutCandidate, now: Date = new Date()): string | null {
  if (!bet.winningSide) return 'not resolved yet - no winning side chosen';
  if (isReadyForPayout(bet, now)) return null;
  return 'dispute window still open';
}
