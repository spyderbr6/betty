/**
 * Notification catalog: the single source of truth for every notification type.
 *
 * Imported by the schema (the Notification.type enum is built from NOTIFICATION_TYPES),
 * the app, and the Lambdas. Adding a type here without cataloguing it is a compile error
 * (`satisfies Record<NotificationType, ...>`), and a unit test checks the rest. Before
 * this existed, the type-to-preference map was maintained by hand and silently missed
 * all eight squares types.
 *
 * Keep this module free of runtime dependencies: it is bundled into the app, into every
 * Lambda that raises notifications, and evaluated during schema synthesis.
 *
 * See PUSH_NOTIFICATION_GUIDE.md §3.
 */

export const NOTIFICATION_TYPES = [
  'FRIEND_REQUEST_RECEIVED',
  'FRIEND_REQUEST_ACCEPTED',
  'FRIEND_REQUEST_DECLINED',
  'BET_INVITATION_RECEIVED',
  'BET_INVITATION_ACCEPTED',
  'BET_INVITATION_DECLINED',
  'BET_JOINED',
  'BET_RESOLVED',
  'BET_CANCELLED',
  'BET_DISPUTED',
  'BET_DEADLINE_APPROACHING',
  'DEPOSIT_COMPLETED',
  'DEPOSIT_FAILED',
  'WITHDRAWAL_COMPLETED',
  'WITHDRAWAL_FAILED',
  'PAYMENT_METHOD_VERIFIED',
  'SYSTEM_ANNOUNCEMENT',
  'SQUARES_GRID_LOCKED',
  'SQUARES_PERIOD_WINNER',
  'SQUARES_GAME_LIVE',
  'SQUARES_GAME_CANCELLED',
  'SQUARES_PURCHASE_CONFIRMED',
  'SQUARES_INVITATION_RECEIVED',
  'SQUARES_INVITATION_ACCEPTED',
  'SQUARES_INVITATION_DECLINED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  'FRIENDS',
  'INVITATIONS',
  'MY_BET_ACTIVITY',
  'RESULTS',
  'ACTION_NEEDED',
  'REFUNDS',
  'REMINDERS',
  'SQUARES_UPDATES',
  'MONEY',
  'ANNOUNCEMENTS',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface CategoryInfo {
  label: string;
  description: string;
  /**
   * Always shown in the notification feed, whatever the user's feed preferences say.
   * The rule: money moved, or the user needs to act. Alerts (push and in-app banners)
   * for these categories can still be muted — nothing is un-mutable.
   */
  feedLocked: boolean;
  /** How long a notification in this category is kept before DynamoDB TTL deletes it. */
  retentionDays: number;
}

export const CATEGORY_INFO = {
  FRIENDS: {
    label: 'Friends',
    description: 'Friend requests and acceptances',
    feedLocked: false,
    retentionDays: 90,
  },
  INVITATIONS: {
    label: 'Invitations',
    description: 'Invitations to bets and squares games',
    feedLocked: false,
    retentionDays: 90,
  },
  MY_BET_ACTIVITY: {
    label: 'Activity on my bets',
    description: 'Someone joined your bet or answered your invitation',
    feedLocked: false,
    retentionDays: 90,
  },
  RESULTS: {
    label: 'Results & payouts',
    description: 'Bets resolved and squares periods won',
    feedLocked: true,
    retentionDays: 180,
  },
  ACTION_NEEDED: {
    label: 'Disputes & action needed',
    description: 'Disputes and anything waiting on you',
    feedLocked: true,
    retentionDays: 90,
  },
  REFUNDS: {
    label: 'Cancellations & refunds',
    description: 'Bets and games cancelled, and the money returned',
    feedLocked: true,
    retentionDays: 180,
  },
  REMINDERS: {
    label: 'Reminders',
    description: 'Deadlines approaching and games about to start',
    feedLocked: false,
    retentionDays: 90,
  },
  SQUARES_UPDATES: {
    label: 'Squares updates',
    description: 'Grids locked and purchases confirmed',
    feedLocked: false,
    retentionDays: 90,
  },
  MONEY: {
    label: 'Money',
    description: 'Deposits, withdrawals and payment methods',
    feedLocked: true,
    retentionDays: 180,
  },
  ANNOUNCEMENTS: {
    label: 'Announcements',
    description: 'App updates and important announcements',
    feedLocked: false,
    retentionDays: 90,
  },
} as const satisfies Record<NotificationCategory, CategoryInfo>;

export interface TypeInfo {
  category: NotificationCategory;
  /**
   * Whether this type ever interrupts (push or in-app banner). False for low-value
   * outcomes like "declined", which only land in the feed.
   */
  alert: boolean;
}

export const NOTIFICATION_CATALOG = {
  FRIEND_REQUEST_RECEIVED: { category: 'FRIENDS', alert: true },
  FRIEND_REQUEST_ACCEPTED: { category: 'FRIENDS', alert: true },
  FRIEND_REQUEST_DECLINED: { category: 'FRIENDS', alert: false },

  BET_INVITATION_RECEIVED: { category: 'INVITATIONS', alert: true },
  SQUARES_INVITATION_RECEIVED: { category: 'INVITATIONS', alert: true },

  BET_JOINED: { category: 'MY_BET_ACTIVITY', alert: true },
  BET_INVITATION_ACCEPTED: { category: 'MY_BET_ACTIVITY', alert: true },
  BET_INVITATION_DECLINED: { category: 'MY_BET_ACTIVITY', alert: false },
  SQUARES_INVITATION_ACCEPTED: { category: 'MY_BET_ACTIVITY', alert: true },
  SQUARES_INVITATION_DECLINED: { category: 'MY_BET_ACTIVITY', alert: false },

  BET_RESOLVED: { category: 'RESULTS', alert: true },
  SQUARES_PERIOD_WINNER: { category: 'RESULTS', alert: true },

  BET_DISPUTED: { category: 'ACTION_NEEDED', alert: true },

  BET_CANCELLED: { category: 'REFUNDS', alert: true },
  SQUARES_GAME_CANCELLED: { category: 'REFUNDS', alert: true },

  BET_DEADLINE_APPROACHING: { category: 'REMINDERS', alert: true },
  SQUARES_GAME_LIVE: { category: 'REMINDERS', alert: true },

  SQUARES_GRID_LOCKED: { category: 'SQUARES_UPDATES', alert: true },
  SQUARES_PURCHASE_CONFIRMED: { category: 'SQUARES_UPDATES', alert: true },

  DEPOSIT_COMPLETED: { category: 'MONEY', alert: true },
  DEPOSIT_FAILED: { category: 'MONEY', alert: true },
  WITHDRAWAL_COMPLETED: { category: 'MONEY', alert: true },
  WITHDRAWAL_FAILED: { category: 'MONEY', alert: true },
  PAYMENT_METHOD_VERIFIED: { category: 'MONEY', alert: true },

  SYSTEM_ANNOUNCEMENT: { category: 'ANNOUNCEMENTS', alert: true },
} as const satisfies Record<NotificationType, TypeInfo>;

const DAY_SECONDS = 24 * 60 * 60;

export function categoryOf(type: NotificationType): NotificationCategory {
  return NOTIFICATION_CATALOG[type].category;
}

/**
 * Fields every Notification write must carry: its category, and `expiresAt` — the
 * epoch-seconds timestamp DynamoDB TTL deletes the row after.
 *
 *   await client.models.Notification.create({ userId, type, title, message, ...notificationMeta(type) });
 */
export function notificationMeta(
  type: NotificationType,
  now: Date = new Date()
): { category: NotificationCategory; expiresAt: number } {
  const category = categoryOf(type);
  return {
    category,
    expiresAt: Math.floor(now.getTime() / 1000) + CATEGORY_INFO[category].retentionDays * DAY_SECONDS,
  };
}
