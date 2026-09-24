/**
 * What happens to a bet when its deadline passes, kept separate from the handler
 * so it can be tested. The handler configures Amplify with a top-level await and
 * imports $amplify/env, neither of which exists in a test run.
 */

export interface ExpiredParticipant {
  id?: string | null;
  userId?: string | null;
  amount?: number | null;
}

export interface Refund {
  participantId: string;
  userId: string;
  amount: number;
}

export type ExpiryOutcome =
  | { action: 'RESOLVE' }
  | { action: 'CANCEL'; reason: string; refunds: Refund[] };

/**
 * A bet only goes to resolution if somebody other than its creator has a stake.
 *
 * The creator is written as a Participant when the bet is created, so the old
 * test - "does this bet have any participants?" - was true for every bet ever
 * made, and the cancellation branch behind it was unreachable. Every expired bet
 * went to PENDING_RESOLUTION, including ones nobody had taken the other side of.
 *
 * A bet nobody joined has no opposing side and nothing to decide. Resolving it
 * means picking a winner against yourself, so it is cancelled and every stake is
 * returned. Refunds cover all participants rather than just the creator: a bet
 * can only reach here with no opponent, but returning exactly what was staked is
 * the safer rule to state, and it stays correct if that ever changes.
 */
export function decideExpiry(
  creatorId: string | null | undefined,
  participants: ExpiredParticipant[] | null | undefined
): ExpiryOutcome {
  const rows = participants ?? [];
  const hasOpponent = rows.some((p) => p.userId && p.userId !== creatorId);

  if (hasOpponent) return { action: 'RESOLVE' };

  const refunds: Refund[] = rows
    .filter((p): p is ExpiredParticipant & { id: string; userId: string } =>
      Boolean(p.id && p.userId)
    )
    .map((p) => ({ participantId: p.id, userId: p.userId, amount: p.amount || 0 }))
    .filter((refund) => refund.amount > 0);

  return {
    action: 'CANCEL',
    reason: 'No one took the other side before the deadline',
    refunds,
  };
}
