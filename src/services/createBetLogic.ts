/**
 * Creating a bet from the app: the id it chooses, and what the server's answer means for
 * the creator. Free of Amplify imports so it is unit tested. The server decides and writes
 * (amplify/shared/createBetLogic.ts).
 */

export type CreateBetResult =
  | { status: 'created'; betId: string; balance: number }
  | { status: 'refused'; reason: 'INVALID'; field: string }
  | { status: 'refused'; reason: 'INSUFFICIENT_FUNDS'; balance: number; required: number }
  | { status: 'refused'; reason: 'BUSY' };

/**
 * A random v4 UUID for the new bet. The app chooses it so a retried tap reaches the same
 * bet instead of creating a second one. crypto.getRandomValues is polyfilled on native by
 * react-native-get-random-values (imported first in App.tsx).
 */
export function newBetId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The mutation returns AWSJSON: an object, or JSON text (sometimes encoded twice). */
export function parseCreateBetResult(data: unknown): CreateBetResult | null {
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
  return status === 'created' || status === 'refused' ? (value as CreateBetResult) : null;
}

const FIELD_NAMES: Record<string, string> = {
  title: 'the title',
  description: 'the description',
  amount: 'the amount',
  sideAName: 'the first side',
  sideBName: 'the second side',
  deadlineMinutes: 'the deadline',
  category: 'the category',
  side: 'your side',
};

/** The alert for a refused or failed create; null when it was created. */
export function createBetProblem(result: CreateBetResult | null, amount: number): { title: string; message: string } | null {
  if (result?.status === 'created') return null;
  if (result?.status === 'refused' && result.reason === 'INSUFFICIENT_FUNDS') {
    return {
      title: 'Insufficient Funds',
      message: `You need $${amount.toFixed(2)} to create this bet, but you only have $${result.balance.toFixed(2)}. Please add funds to your account.`,
    };
  }
  if (result?.status === 'refused' && result.reason === 'INVALID' && FIELD_NAMES[result.field]) {
    return { title: 'Check Your Bet', message: `Please check ${FIELD_NAMES[result.field]} and try again.` };
  }
  return { title: 'Error', message: 'Failed to create bet. Please try again.' };
}
