import type {
  AppSyncIdentityCognito,
  AppSyncResolverEvent,
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/push-notification-sender';
import webpush from 'web-push';
import {
  buildExpoMessages,
  countSuccesses,
  resolvePushTargets,
  succeededTokenIds,
  tokensToDeactivate,
  type PushTarget,
} from './pushLogic';
import {
  type AttributeValue,
  chunk,
  decidePush,
  notificationFromImage,
  pushData,
  pushPriority,
  webPushOptions,
} from './dispatchLogic';

// CRITICAL: Top-level await configuration - this is required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

// Configure web-push with VAPID details from environment (matching working app pattern)
webpush.setVapidDetails(
  env.WEB_PUSH_EMAIL,
  env.WEB_PUSH_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY
);

/**
 * The notification dispatcher. Two entry points:
 *
 * - A DynamoDB stream on the Notification table (INSERTs only; wired in backend.ts).
 *   Every notification row, written by the app or by any Lambda, comes through here, and
 *   this is the one place that decides whether it pushes. Before this, only notifications
 *   raised by the app could push, so payouts, cancellations, squares and deposits never did.
 * - The sendTestPush mutation, which pushes a test message to the caller's own devices.
 *
 * See PUSH_NOTIFICATION_GUIDE.md §1.
 */
export const handler = async (
  event: DynamoDBStreamEvent | AppSyncResolverEvent<Record<string, never>>
): Promise<DynamoDBBatchResponse | number> => {
  if ('Records' in event && Array.isArray(event.Records)) {
    return handleStream(event as DynamoDBStreamEvent);
  }
  return handleAppSync(event as AppSyncResolverEvent<Record<string, never>>);
};

async function handleAppSync(event: AppSyncResolverEvent<Record<string, never>>): Promise<number> {
  if (event.info?.fieldName !== 'sendTestPush') {
    throw new Error(`Unexpected field: ${event.info?.fieldName}`);
  }
  // The caller's identity comes from Cognito: a test can only reach the caller's own devices.
  const userId = (event.identity as AppSyncIdentityCognito | null)?.sub;
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return deliver(
    userId,
    'Test notification',
    'Push notifications are working on this device.',
    { type: 'SYSTEM_ANNOUNCEMENT', test: true },
    'HIGH'
  );
}

/**
 * Dispatch each newly inserted notification. A record that fails for an infrastructure
 * reason (a data-layer error) is reported back so Lambda retries just that record; a
 * push the provider rejects is not a failure here — it is logged and the device handled.
 */
async function handleStream(event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> {
  const batchItemFailures: DynamoDBBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT') continue;
    try {
      await dispatch(record.dynamodb?.NewImage as Record<string, AttributeValue> | undefined);
    } catch (error) {
      console.error('[Dispatch] Failed to dispatch record:', record.dynamodb?.SequenceNumber, error);
      if (record.dynamodb?.SequenceNumber) {
        batchItemFailures.push({ itemIdentifier: record.dynamodb.SequenceNumber });
      }
    }
  }

  return { batchItemFailures };
}

async function dispatch(image: Record<string, AttributeValue> | undefined): Promise<void> {
  const notification = notificationFromImage(image);
  if (!notification) {
    console.warn('[Dispatch] Skipping a row that is not a pushable notification');
    return;
  }

  const { data: prefsRows, errors } = await client.models.NotificationPreferences.notificationPreferencesByUser({
    userId: notification.userId,
  });
  if (errors?.length) {
    throw new Error(`Preferences lookup failed: ${JSON.stringify(errors)}`);
  }

  const decision = decidePush(notification, prefsRows?.[0] ?? null, new Date());
  if (!decision.push) {
    console.log(`[Dispatch] ${notification.id} (${notification.type}) not pushed: ${decision.reason}`);
    return;
  }

  const sent = await deliver(
    notification.userId,
    notification.title,
    notification.message,
    pushData(notification),
    pushPriority(notification.priority)
  );
  console.log(`[Dispatch] ${notification.id} (${notification.type}) pushed to ${sent} device(s)`);
}

/**
 * Send one message to every device the user can be pushed on. Returns how many accepted it.
 */
async function deliver(
  userId: string,
  title: string,
  message: string,
  data: Record<string, unknown>,
  priority: 'HIGH' | 'MEDIUM'
): Promise<number> {
  // Through the userId index: a filtered list is a paged Scan, which silently stops
  // finding a user's rows once the table outgrows a scan page.
  const { data: devices } = await client.models.PushDevice.pushDevicesByUser({ userId }, { limit: 1000 });
  const targets = resolvePushTargets(devices);

  if (targets.length === 0) {
    console.log(`No active push targets for user ${userId}`);
    return 0;
  }

  const mobile = targets.filter((t) => t.platform === 'IOS' || t.platform === 'ANDROID');
  const web = targets.filter((t) => t.platform === 'WEB');

  const [mobileSent, webSent] = await Promise.all([
    mobile.length > 0 ? sendViaExpoPush(mobile, title, message, data, priority) : 0,
    web.length > 0 ? sendViaWebPush(web, title, message, data, priority) : 0,
  ]);
  return mobileSent + webSent;
}

/**
 * Send push notifications via Expo Push Service (iOS/Android)
 */
async function sendViaExpoPush(
  tokens: PushTarget[],
  title: string,
  message: string,
  data: Record<string, unknown>,
  priority: string
): Promise<number> {
  let accepted = 0;
  // Expo takes at most 100 messages per request.
  for (const batch of chunk(tokens)) {
    accepted += await sendExpoBatch(batch, title, message, data, priority);
  }
  return accepted;
}

async function sendExpoBatch(
  tokens: PushTarget[],
  title: string,
  message: string,
  data: Record<string, unknown>,
  priority: string
): Promise<number> {
  try {
    const notifications = buildExpoMessages(tokens, title, message, data, priority);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    // Expo requires this when "Enhanced Security for Push Notifications" is on for the
    // project. The secret was configured but never sent.
    if (env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(notifications),
    });

    if (!response.ok) {
      // Include the body: a 401 here means EXPO_ACCESS_TOKEN is wrong or revoked, and
      // Expo says so in the response rather than the status alone.
      const body = await response.text().catch(() => '');
      throw new Error(`Expo push service responded with status: ${response.status} ${body}`);
    }

    const result = await response.json();
    console.log('[Expo Push] Result:', result);

    // Expo returns one ticket per message, in request order, so ticket i belongs
    // to tokens[i]. Both branches below used to filter the tickets first and then
    // index the unfiltered token array with the filtered position, which stamped
    // and deactivated the wrong registrations. See pushLogic for the detail.
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const succeeded = succeededTokenIds(tokens, result.data).map((id) => byId.get(id)!);
    await Promise.all(succeeded.map(markDelivered));

    const dead = tokensToDeactivate(tokens, result.data).map((id) => byId.get(id)!);
    if (dead.length > 0) {
      console.log(`[Expo Push] Marking ${dead.length} tokens as inactive`);
      await Promise.all(dead.map(markDead));
    }

    return countSuccesses(result.data);

  } catch (error) {
    console.error('[Expo Push] Error:', error);
    return 0;
  }
}

/**
 * Send push notifications via Web Push API (browsers)
 */
async function sendViaWebPush(
  tokens: PushTarget[],
  title: string,
  message: string,
  data: Record<string, unknown>,
  priority: 'HIGH' | 'MEDIUM'
): Promise<number> {
  try {
    const payload = JSON.stringify({
      title,
      message,
      body: message, // Some systems use 'body' instead of 'message'
      icon: '/assets/icon.png',
      badge: '/assets/icon.png',
      tag: data?.type || 'default',
      data: data || {},
      priority,
    });

    let successCount = 0;

    // Send to each web subscription
    await Promise.all(
      tokens.map(async (tokenRecord) => {
        try {
          const subscription = JSON.parse(tokenRecord.token);

          await webpush.sendNotification(subscription, payload, webPushOptions(priority));
          await markDelivered(tokenRecord);

          successCount++;
          console.log(`[Web Push] Sent to token ${tokenRecord.id}`);

        } catch (error: any) {
          console.error(`[Web Push] Failed to send to token ${tokenRecord.id}:`, error);

          // If subscription is invalid or expired, mark token as inactive
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`[Web Push] Marking token ${tokenRecord.id} as inactive`);
            await markDead(tokenRecord);
          }
        }
      })
    );

    console.log(`[Web Push] Successfully sent ${successCount} notifications`);
    return successCount;

  } catch (error) {
    console.error('[Web Push] Error:', error);
    return 0;
  }
}

/** Record a successful delivery on the device. */
async function markDelivered(target: PushTarget): Promise<void> {
  await client.models.PushDevice.update({ id: target.id, lastSuccessAt: new Date().toISOString(), failureCount: 0 });
}

/** Stop sending to a token the push service says is gone. */
async function markDead(target: PushTarget): Promise<void> {
  await client.models.PushDevice.update({ id: target.id, isActive: false });
}
