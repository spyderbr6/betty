/**
 * What the joinBet mutation's answer means for the person joining, kept free of Amplify
 * imports so it is unit tested. The server decides whether a join can happen
 * (amplify/shared/joinLogic.ts); this turns its answer into the alert the app shows.
 */

export type JoinRefusal =
  | 'NOT_FOUND'
  | 'NOT_OPEN'
  | 'EXPIRED'
  | 'INVALID_SIDE'
  | 'NO_STAKE'
  | 'AMOUNT_CHANGED'
  | 'ALREADY_JOINED'
  | 'NOT_INVITED'
  | 'INSUFFICIENT_FUNDS'
  | 'BUSY';

export type JoinResult =
  | { status: 'joined'; participantId: string; amount: number; balance: number }
  | { status: 'refused'; reason: JoinRefusal; balance?: number; required?: number };

/** The mutation returns AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseJoinResult(data: unknown): JoinResult | null {
  let value = data;
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const status = (value as { status?: unknown }).status;
  return status === 'joined' || status === 'refused' ? (value as JoinResult) : null;
}

export interface JoinMessage {
  title: string;
  message: string;
}

/** The alert for a join's outcome. `amount` is the stake the app showed. */
export function joinMessage(result: JoinResult | null, amount: number): JoinMessage {
  if (!result) return { title: 'Error', message: 'Failed to join bet. Please try again.' };
  if (result.status === 'joined') {
    return {
      title: 'Joined Successfully!',
      message: `You've joined the bet with $${result.amount}. Your new balance is $${result.balance.toFixed(2)}.`,
    };
  }
  switch (result.reason) {
    case 'INSUFFICIENT_FUNDS':
      return {
        title: 'Insufficient Balance',
        message: `You need $${result.required ?? amount} to join this bet, but your current balance is $${(result.balance ?? 0).toFixed(2)}.`,
      };
    case 'ALREADY_JOINED':
      return { title: 'Already Joined', message: 'You have already joined this bet.' };
    case 'NOT_FOUND':
    case 'NOT_OPEN':
      return { title: 'Bet Not Available', message: 'This bet is no longer available to join.' };
    case 'EXPIRED':
      return { title: 'Bet Closed', message: 'This bet has passed its deadline and can no longer be joined.' };
    case 'NOT_INVITED':
      return { title: 'Invitation Required', message: 'This is a private bet. You need an invitation to join it.' };
    case 'AMOUNT_CHANGED':
      return { title: 'Stake Changed', message: 'The stake for this bet has changed. Refresh and try again.' };
    default:
      return { title: 'Error', message: 'Failed to join bet. Please try again.' };
  }
}
