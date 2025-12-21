import { AppSyncResolverHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/push-notification-sender';
import * as webPush from 'web-push';

// CRITICAL: Top-level await configuration - this is required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

// Configure web-push with VAPID keys
const WEB_PUSH_PUBLIC_KEY = env.WEB_PUSH_PUBLIC_KEY || '';
const WEB_PUSH_PRIVATE_KEY = env.WEB_PUSH_PRIVATE_KEY || '';
const WEB_PUSH_EMAIL = env.WEB_PUSH_EMAIL || 'mailto:admin@sidebet.app';

if (WEB_PUSH_PUBLIC_KEY && WEB_PUSH_PRIVATE_KEY) {
  webPush.setVapidDetails(
    WEB_PUSH_EMAIL,
    WEB_PUSH_PUBLIC_KEY,
    WEB_PUSH_PRIVATE_KEY
  );
  console.log('[Web Push] VAPID keys configured');
} else {
  console.warn('[Web Push] VAPID keys not configured - web push notifications will not work');
}

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

    // Get user's active push tokens
    const { data: tokens } = await client.models.PushToken.list({
      filter: {
        userId: { eq: userId },
        isActive: { eq: true }
      }
    });

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
    const notifications = tokens.map((tokenRecord: any) => ({
      to: tokenRecord.token!,
      sound: 'default',
      title,
      body: message,
      data: data || {},
      badge: 1,
      priority: priority === 'HIGH' ? 'high' : 'normal',
      channelId: priority === 'HIGH' ? 'urgent' : 'default',
    }));

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

    // Update lastUsed timestamp for successful tokens
    const successfulSends = result.data?.filter((r: any) => r.status === 'ok') || [];
    if (successfulSends.length > 0) {
      const now = new Date().toISOString();
      await Promise.all(
        successfulSends.map((_: any, index: number) =>
          client.models.PushToken.update({
            id: tokens[index].id!,
            lastUsed: now,
          })
        )
      );
    }

    // Handle failed tokens
    const failedSends = result.data?.filter((r: any) =>
      r.status === 'error' && r.details?.error?.includes('DeviceNotRegistered')
    ) || [];

    if (failedSends.length > 0) {
      console.log(`[Expo Push] Marking ${failedSends.length} tokens as inactive`);
      await Promise.all(
        failedSends.map((_: any, index: number) => {
          if (tokens[index]) {
            return client.models.PushToken.update({
              id: tokens[index].id!,
              isActive: false,
            });
          }
        })
      );
    }

    return successfulSends.length;

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
    if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) {
      console.error('[Web Push] VAPID keys not configured');
      return 0;
    }

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

          await webPush.sendNotification(subscription, payload);

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