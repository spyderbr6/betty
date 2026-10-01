import { AppSyncResolverHandler } from 'aws-lambda';
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

interface PushNotificationArgs {
  userId: string;
  title: string;
  message: string;
  data?: any;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Handler for sending push notifications via AppSync (supports both Expo and Web Push)
export const handler: AppSyncResolverHandler<PushNotificationArgs, boolean> = async (event) => {
  console.log('Push notification request:', JSON.stringify(event, null, 2));

  try {
    const { userId, title, message, data, priority = 'MEDIUM' } = event.arguments;

    // Devices come from PushDevice, with legacy PushToken rows as a fallback for app builds
    // that predate it; resolvePushTargets decides which rows win and sends each token once.
    // Both are read through their userId index — a filtered list is a paged Scan, and once
    // PushToken outgrew a scan page a user's own tokens stopped coming back and every push
    // for them silently no-opped as "no active push tokens".
    const [{ data: devices }, { data: legacyTokens }] = await Promise.all([
      client.models.PushDevice.pushDevicesByUser({ userId }, { limit: 1000 }),
      // Large limit: before registration was an upsert, one device could hold dozens of
      // duplicate PushToken rows, and a distinct token past the first page would be missed.
      client.models.PushToken.pushTokensByUser({ userId }, { limit: 1000 }),
    ]);
    const targets = resolvePushTargets(devices, legacyTokens);

    if (targets.length === 0) {
      console.log(`No active push targets found for user ${userId}`);
      return false;
    }

    // Separate targets by transport
    const mobileTokens = targets.filter((t) => t.platform === 'IOS' || t.platform === 'ANDROID');
    const webTokens = targets.filter((t) => t.platform === 'WEB');

    console.log(`Push targets for ${userId}: ${mobileTokens.length} mobile, ${webTokens.length} web`);

    let successCount = 0;

    // Send to mobile devices via Expo Push Service
    if (mobileTokens.length > 0) {
      console.log('[Expo Push] Sending to mobile devices...');
      const mobileSuccess = await sendViaExpoPush(mobileTokens, title, message, data, priority);
      successCount += mobileSuccess;
    }

    // Send to web browsers via Web Push API
    if (webTokens.length > 0) {
      console.log('[Web Push] Sending to web browsers...');
      const webSuccess = await sendViaWebPush(webTokens, title, message, data, priority);
      successCount += webSuccess;
    }

    console.log(`Successfully sent ${successCount} push notifications`);
    return successCount > 0;

  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

/**
 * Send push notifications via Expo Push Service (iOS/Android)
 */
async function sendViaExpoPush(
  tokens: PushTarget[],
  title: string,
  message: string,
  data: any,
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
  data: any,
  priority: string
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

          await webpush.sendNotification(subscription, payload);
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

/** Record a successful delivery on whichever table the target came from. */
async function markDelivered(target: PushTarget): Promise<void> {
  const now = new Date().toISOString();
  if (target.source === 'device') {
    await client.models.PushDevice.update({ id: target.id, lastSuccessAt: now, failureCount: 0 });
  } else {
    await client.models.PushToken.update({ id: target.id, lastUsed: now });
  }
}

/** Stop sending to a token the push service says is gone. */
async function markDead(target: PushTarget): Promise<void> {
  if (target.source === 'device') {
    await client.models.PushDevice.update({ id: target.id, isActive: false });
  } else {
    await client.models.PushToken.update({ id: target.id, isActive: false });
  }
}
