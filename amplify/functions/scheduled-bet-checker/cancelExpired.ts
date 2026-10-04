/**
 * Cancelling an expired bet and returning its stakes: one ledger transaction for the
 * refunds and the bet's ACTIVE -> CANCELLED change (see shared/cancelWithRefunds.ts).
 * Kept apart from the handler so it is tested; the handler cannot be imported by a test.
 */

import type { LedgerEntry } from '../../shared/ledgerLogic';
import { refundTransactionId } from '../../shared/settlementLogic';
import { cancelWithRefunds, type ApplyLedger, type CancelOutcome } from '../../shared/cancelWithRefunds';
import type { Refund } from './expiryLogic';

export { REFUNDS_PER_TRANSACTION, type ApplyLedger, type CancelOutcome } from '../../shared/cancelWithRefunds';

export function refundEntry(betId: string, refund: Refund, reason: string): LedgerEntry {
  return {
    transactionId: refundTransactionId(refund.participantId),
    userId: refund.userId,
    type: 'BET_CANCELLED',
    delta: refund.amount,
    amount: refund.amount,
    status: 'COMPLETED',
    mode: 'create',
    relatedBetId: betId,
    relatedParticipantId: refund.participantId,
    notes: `Refund: ${reason}`,
  };
}

export function cancelExpiredBet(
  apply: ApplyLedger,
  betId: string,
  refunds: Refund[],
  reason: string
): Promise<CancelOutcome> {
  return cancelWithRefunds(
    apply,
    { table: 'Bet', id: betId, set: { status: 'CANCELLED', resolutionReason: reason }, expect: { status: 'ACTIVE' } },
    refunds.map((refund) => refundEntry(betId, refund, reason))
  );
}
