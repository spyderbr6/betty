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
  succeededTokenIds,
  tokensToDeactivate,
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

    // Get the user's push tokens through the userId index, then drop inactive ones in
    // memory (a user has a handful of devices, so there is nothing to gain from filtering
    // server-side). This was a filtered list, which is a paged DynamoDB Scan rather than a
    // lookup: once the table outgrew a scan page the user's own tokens stopped coming back
    // and every push for them silently no-opped as "no active push tokens".
    const { data: allTokens } = await client.models.PushToken.pushTokensByUser({ userId });
    const tokens = (allTokens ?? []).filter((t: any) => t.isActive);

    if (!tokens || tokens.length === 0) {
      console.log(`No active push tokens found for user ${userId}`);
      return false;
    }

    console.log(`Found ${tokens.length} active push tokens for user ${userId}`);

    // Separate tokens by platform
    const mobileTokens = tokens.filter((t: any) => t.platform === 'IOS' || t.platform === 'ANDROID');
    const webTokens = tokens.filter((t: any) => t.platform === 'WEB');

    console.log(`Mobile tokens: ${mobileTokens.length}, Web tokens: ${webTokens.length}`);

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
  tokens: any[],
  title: string,
  message: string,
  data: any,
  priority: string
): Promise<number> {
  try {
    const notifications = buildExpoMessages(tokens, title, message, data, priority);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notifications),
    });

    if (!response.ok) {
      throw new Error(`Expo push service responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('[Expo Push] Result:', result);

    // Expo returns one ticket per message, in request order, so ticket i belongs
    // to tokens[i]. Both branches below used to filter the tickets first and then
    // index the unfiltered token array with the filtered position, which stamped
    // and deactivated the wrong registrations. See pushLogic for the detail.
    const succeededIds = succeededTokenIds(tokens, result.data);
    if (succeededIds.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        succeededIds.map((id) => client.models.PushToken.update({ id, lastUsed: now }))
      );
    }

    const deadIds = tokensToDeactivate(tokens, result.data);
    if (deadIds.length > 0) {
      console.log(`[Expo Push] Marking ${deadIds.length} tokens as inactive`);
      await Promise.all(
        deadIds.map((id) => client.models.PushToken.update({ id, isActive: false }))
      );
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
  tokens: any[],
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
    const now = new Date().toISOString();

    // Send to each web subscription
    await Promise.all(
      tokens.map(async (tokenRecord: any) => {
        try {
          const subscription = JSON.parse(tokenRecord.token!);

          await webpush.sendNotification(subscription, payload);

          // Update lastUsed timestamp
          await client.models.PushToken.update({
            id: tokenRecord.id!,
            lastUsed: now,
          });

          successCount++;
          console.log(`[Web Push] Sent to token ${tokenRecord.id}`);

        } catch (error: any) {
          console.error(`[Web Push] Failed to send to token ${tokenRecord.id}:`, error);

          // If subscription is invalid or expired, mark token as inactive
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`[Web Push] Marking token ${tokenRecord.id} as inactive`);
            await client.models.PushToken.update({
              id: tokenRecord.id!,
              isActive: false,
            });
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