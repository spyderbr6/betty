/**
 * What the resolveBet mutation's answer means for the creator, kept free of Amplify
 * imports so it is unit tested. The server decides and writes (amplify/shared/resolveLogic.ts).
 */

export type ResolveRefusal = 'NOT_FOUND' | 'NOT_CREATOR' | 'NOT_RESOLVABLE' | 'INVALID_SIDE' | 'BUSY';

export type ResolveResult =
  | { status: 'resolved'; winningSide: 'A' | 'B'; disputeWindowEndsAt: string; winners: number; refundedNoWinners: boolean }
  | { status: 'refused'; reason: ResolveRefusal };

/** The mutation returns AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseResolveResult(data: unknown): ResolveResult | null {
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
  return status === 'resolved' || status === 'refused' ? (value as ResolveResult) : null;
}

/** The alert after resolving. `winnerName` is the side's display name. */
export function resolveMessage(result: ResolveResult | null, winnerName: string): { title: string; message: string } {
  if (result?.status === 'resolved') {
    return {
      title: 'Bet Resolved',
      message: result.refundedNoWinners
        ? `Winner: ${winnerName}\n\nNobody backed ${winnerName}, so every stake will be returned after the 48-hour dispute window.`
        : `Winner: ${winnerName}\n\nPayouts are pending a 48-hour dispute window. If no disputes are filed, funds will be automatically distributed.`,
    };
  }
  if (result?.status === 'refused') {
    switch (result.reason) {
      case 'NOT_RESOLVABLE':
        return { title: 'Already Resolved', message: 'This bet already has a result, or can no longer be resolved.' };
      case 'NOT_CREATOR':
        return { title: 'Not Your Bet', message: 'Only the person who created this bet can resolve it.' };
      case 'NOT_FOUND':
        return { title: 'Bet Not Found', message: 'This bet no longer exists.' };
      case 'BUSY':
        return { title: 'Bet Changed', message: 'This bet changed while you were resolving it (someone may have just joined). Please check it and try again.' };
    }
  }
  return { title: 'Error', message: 'Failed to resolve bet. Please try again.' };
}
