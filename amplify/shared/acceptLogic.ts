/**
 * Accepting a bet's result, decided and written on the server (docs/SECURITY_PLAN.md
 * step 3). When every participant but the creator has accepted, the dispute window closes
 * early and the payout processor pays on its next run.
 *
 * The phone used to do it: mark its own acceptance, count everyone's, and when all had
 * accepted set the bet's disputeWindowEndsAt to the past itself. That field decides when
 * money moves, and any signed-in user could set it on any bet. Here the server checks the
 * caller is a participant, counts, and writes the acceptance and the early close in one
 * transaction guarded on the result still being the one they accepted.
 *
 * Pure, so it is unit tested; the money function reads the rows and applies the plan.
 */

import type { StateUpdate } from './ledgerLogic';

export type AcceptRefusal = 'NOT_FOUND' | 'IS_CREATOR' | 'NOT_PARTICIPANT' | 'NOT_AWAITING';

export type AcceptResult =
  | { status: 'accepted'; closedEarly: boolean; accepted: number; total: number }
  | { status: 'refused'; reason: AcceptRefusal };

export interface AcceptBetRow {
  id: string;
  creatorId?: string | null;
  status?: string | null;
  winningSide?: string | null;
  disputeWindowEndsAt?: string | null;
}

export interface AcceptParticipant {
  id: string;
  userId: string;
  hasAcceptedResult?: boolean | null;
}

/** Why the caller cannot accept this result, or null when they can. */
export function checkAccept(bet: AcceptBetRow | null | undefined, userId: string, participants: AcceptParticipant[]): AcceptRefusal | null {
  if (!bet) return 'NOT_FOUND';
  // The creator's resolution is their acceptance
  if (bet.creatorId === userId) return 'IS_CREATOR';
  if (!participants.some((p) => p.userId === userId)) return 'NOT_PARTICIPANT';
  if (bet.status !== 'PENDING_RESOLUTION' || !bet.winningSide) return 'NOT_AWAITING';
  return null;
}

/** How long before now the window is set when it closes early, so the next run is sure to see it. */
export const EARLY_CLOSE_LEAD_MS = 60_000;

/**
 * The write: the caller's acceptance, and the early close when theirs completes the set.
 * Assumes checkAccept passed.
 */
export function planAccept(params: {
  bet: AcceptBetRow & { winningSide: string };
  userId: string;
  participants: AcceptParticipant[];
  now: string;
}): { stateUpdates: StateUpdate[]; closesEarly: boolean; accepted: number; total: number } {
  const { bet, userId, participants, now } = params;
  const others = participants.filter((p) => p.userId !== bet.creatorId);
  const acceptedAfter = (p: AcceptParticipant) => p.userId === userId || p.hasAcceptedResult === true;
  const accepted = others.filter(acceptedAfter).length;
  const total = others.length;

  const stateUpdates: StateUpdate[] = participants
    .filter((p) => p.userId === userId && p.hasAcceptedResult !== true)
    .map((p) => ({
      table: 'Participant' as const,
      id: p.id,
      set: { hasAcceptedResult: true, acceptedResultAt: now },
    }));

  const windowOpen = !bet.disputeWindowEndsAt || bet.disputeWindowEndsAt > now;
  const closesEarly = total > 0 && accepted === total && windowOpen;
  if (closesEarly) {
    stateUpdates.push({
      table: 'Bet',
      id: bet.id,
      set: { disputeWindowEndsAt: new Date(new Date(now).getTime() - EARLY_CLOSE_LEAD_MS).toISOString() },
      // Still the result everyone accepted: not re-resolved or settled in the meantime
      expect: { status: 'PENDING_RESOLUTION', winningSide: bet.winningSide },
    });
  }
  return { stateUpdates, closesEarly, accepted, total };
}
