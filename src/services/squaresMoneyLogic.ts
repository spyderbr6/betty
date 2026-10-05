/**
 * What the buySquares and cancelSquaresGame mutations' answers mean for the person
 * acting, kept free of Amplify imports so it is unit tested. The server decides and writes
 * (amplify/shared/squaresBuyLogic.ts, amplify/shared/squaresMoney.ts).
 */

export type BuyResult =
  | { status: 'bought'; squares: number; total: number; balance: number; locked: boolean }
  | {
      status: 'refused';
      reason: 'NOT_FOUND' | 'NOT_OPEN' | 'INVALID_SQUARES' | 'TOO_MANY' | 'SQUARE_TAKEN' | 'INVALID_OWNER' | 'INSUFFICIENT_FUNDS' | 'BUSY';
      balance?: number;
      required?: number;
      taken?: Array<{ row: number; col: number }>;
    };

export type CancelResult =
  | { status: 'cancelled'; refunded: number }
  | { status: 'refused'; reason: 'NOT_FOUND' | 'NOT_ALLOWED' | 'NOT_CANCELLABLE' | 'ALREADY_PAID' };

/** The mutations return AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseMoneyResult<T extends { status: string }>(data: unknown, statuses: string[]): T | null {
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

/** "A1, D8": how the grid labels squares (rows A-J, columns 1-10). */
const label = (s: { row: number; col: number }) => `${String.fromCharCode(65 + s.row)}${s.col + 1}`;

/** Why a purchase did not go through, for the purchase sheet. */
export function buyFailureMessage(result: BuyResult | null): string {
  if (!result) return 'Failed to purchase squares. Please try again.';
  if (result.status === 'bought') return '';
  switch (result.reason) {
    case 'INSUFFICIENT_FUNDS':
      return `You need $${(result.required ?? 0).toFixed(2)} for these squares, but your balance is $${(result.balance ?? 0).toFixed(2)}.`;
    case 'SQUARE_TAKEN':
      return result.taken?.length
        ? `Someone else just bought ${result.taken.map(label).join(', ')}. Please pick other squares.`
        : 'Some of those squares were just bought. Please pick other squares.';
    case 'NOT_OPEN':
    case 'NOT_FOUND':
      return 'This game is no longer accepting purchases.';
    case 'TOO_MANY':
      return 'That is too many squares for one purchase. Please buy them in smaller batches.';
    case 'INVALID_OWNER':
      return 'Please enter an owner name of up to 50 characters.';
    default:
      return 'Failed to purchase squares. Please try again.';
  }
}

/** Why a cancellation did not go through. */
export function cancelFailureMessage(result: CancelResult | null): string {
  if (!result) return 'Failed to cancel the game. Please try again.';
  if (result.status === 'cancelled') return '';
  switch (result.reason) {
    case 'ALREADY_PAID':
      return 'A period of this game has already paid out, so it can no longer be cancelled. Refunding now would pay those winners twice.';
    case 'NOT_CANCELLABLE':
      return 'This game can no longer be cancelled.';
    case 'NOT_ALLOWED':
      return 'Only the game creator or an admin can cancel this game.';
    default:
      return 'Failed to cancel the game. Please try again.';
  }
}
