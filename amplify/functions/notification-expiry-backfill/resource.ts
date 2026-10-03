import { defineFunction } from '@aws-amplify/backend';

/**
 * One-off: give notifications written before TTL existed an `expiresAt`. No schedule —
 * run it by hand from the Lambda console (see docs/NOTIFICATIONS_PLAN.md, Phase 4).
 *
 * Lives in the data stack: it is granted direct access to the Notification table, and the
 * function stack cannot reference the data stack without a cycle (the data stack already
 * depends on it for resolver functions).
 */
export const notificationExpiryBackfill = defineFunction({
  name: 'notification-expiry-backfill',
  entry: './handler.ts',
  timeoutSeconds: 900,
  memoryMB: 512,
  resourceGroupName: 'data',
});
