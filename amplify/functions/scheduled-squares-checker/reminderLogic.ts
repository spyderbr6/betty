/**
 * Who to remind about a squares game they were invited to and have not answered.
 *
 * A reminder goes to each invitee whose invitation is still PENDING and who has bought no
 * squares, once the grid is due to lock within REMINDER_LEAD_MINUTES. The checker runs every
 * five minutes, so each invitee is seen several times inside the window; the notification's
 * fixed id (notificationIds.squaresReminderNotificationId) keeps it to one.
 *
 * Kept apart from the handler so it is tested; the handler cannot be imported by a test.
 */

export const REMINDER_LEAD_MINUTES = 60;

/** A full grid locks at once, so there is nothing left to buy. */
const GRID_SIZE = 100;

export interface ReminderGame {
  status?: string | null;
  creatorId?: string | null;
  locksAt?: string | null;
  squaresSold?: number | null;
}

export interface ReminderInvitation {
  id: string;
  toUserId: string;
  status?: string | null;
}

export interface ReminderPurchase {
  userId: string;
}

/** Whether a game is in the reminder window: still open, locking soon, not yet locked. */
export function isInReminderWindow(game: ReminderGame, now: Date): boolean {
  if (game.status !== 'ACTIVE' || !game.locksAt) return false;
  if ((game.squaresSold ?? 0) >= GRID_SIZE) return false;
  const msLeft = new Date(game.locksAt).getTime() - now.getTime();
  return Number.isFinite(msLeft) && msLeft > 0 && msLeft <= REMINDER_LEAD_MINUTES * 60_000;
}

/** The invitations to remind about, at most one per invitee. */
export function invitationsToRemind(
  game: ReminderGame,
  invitations: ReminderInvitation[],
  purchases: ReminderPurchase[],
  now: Date
): ReminderInvitation[] {
  if (!isInReminderWindow(game, now)) return [];
  const bought = new Set(purchases.map((p) => p.userId));
  const seen = new Set<string>();
  const due: ReminderInvitation[] = [];
  for (const invitation of invitations) {
    if (invitation.status !== 'PENDING') continue;
    if (invitation.toUserId === game.creatorId) continue;
    if (bought.has(invitation.toUserId) || seen.has(invitation.toUserId)) continue;
    seen.add(invitation.toUserId);
    due.push(invitation);
  }
  return due;
}

/** "45 minutes", "1 minute": time left before the grid locks, rounded up. */
export function timeLeftText(locksAt: string, now: Date): string {
  const minutes = Math.max(1, Math.ceil((new Date(locksAt).getTime() - now.getTime()) / 60_000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
