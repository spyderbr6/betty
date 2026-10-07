/**
 * What the server's endBetEarly and fileDispute answers mean for the app
 * (amplify/shared/betStatusLogic.ts decides). Free of Amplify imports so it is unit tested.
 */

export type EndEarlyResult =
  | { status: 'ended' }
  | { status: 'refused'; reason: 'NOT_FOUND' | 'NOT_CREATOR' | 'NOT_ACTIVE' };

export type FileDisputeResult =
  | { status: 'filed'; disputeId: string }
  | {
      status: 'refused';
      reason: 'NOT_FOUND' | 'NOT_PARTICIPANT' | 'IS_CREATOR' | 'NOT_RESOLVED' | 'WINDOW_CLOSED' | 'ALREADY_DISPUTED' | 'INVALID';
    };

/** The mutations return AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseStatusResult<T extends { status: string }>(data: unknown, statuses: string[]): T | null {
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
  return typeof status === 'string' && statuses.includes(status) ? (value as T) : null;
}

/** The alert for a bet that could not be ended; null when it was. */
export function endEarlyProblem(result: EndEarlyResult | null): string | null {
  if (result?.status === 'ended') return null;
  if (result?.status === 'refused' && result.reason === 'NOT_ACTIVE') return 'This bet has already ended.';
  if (result?.status === 'refused' && result.reason === 'NOT_CREATOR') return 'Only the bet creator can end it.';
  return 'Failed to end bet. Please try again.';
}

const DISPUTE_MESSAGES: Record<string, string> = {
  NOT_PARTICIPANT: 'Only participants in this bet can dispute it.',
  IS_CREATOR: 'You cannot dispute your own bet.',
  NOT_RESOLVED: 'Only a result that has not been paid out yet can be disputed.',
  WINDOW_CLOSED: 'The dispute window for this bet has closed.',
  ALREADY_DISPUTED: 'A dispute is already open for this bet.',
  INVALID: 'Please choose a reason and describe the problem.',
  NOT_FOUND: 'This bet could not be found.',
};

/** The error message for a dispute that was not filed; null when it was. */
export function fileDisputeProblem(result: FileDisputeResult | null): string | null {
  if (result?.status === 'filed') return null;
  if (result?.status === 'refused') return DISPUTE_MESSAGES[result.reason] ?? 'Failed to file dispute. Please try again.';
  return 'Failed to file dispute. Please try again.';
}
