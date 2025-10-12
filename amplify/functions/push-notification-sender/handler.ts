import { AppSyncResolverHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/push-notification-sender';

// CRITICAL: Top-level await configuration - this is required for proper client initialization
const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

// Use non-generic client to avoid complex union type inference
const client = generateClient<Schema>() as any;

interface PushNotificationArgs {
  userId: string;
  title: string;
  message: string;
  data?: any;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
}

// Handler for sending push notifications via AppSync
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

    // Prepare notifications for all active tokens
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

    // Send via Expo push service
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        // In production, add: 'Authorization': `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(notifications),
    });

    if (!response.ok) {
      throw new Error(`Push service responded with status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Push notification result:', result);

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

    // Handle failed tokens - mark as inactive if they permanently failed
    const failedSends = result.data?.filter((r: any) =>
      r.status === 'error' &&
      r.details?.error?.includes('DeviceNotRegistered')
    ) || [];

    if (failedSends.length > 0) {
      await Promise.all(
        failedSends.map((_: any, index: number) => {
          const tokenIndex = result.data.findIndex((r: any) => r.status === 'error');
          if (tokenIndex !== -1 && tokens[tokenIndex]) {
            return client.models.PushToken.update({
              id: tokens[tokenIndex].id!,
              isActive: false,
            });
          }
        })
      );
    }

    return successfulSends.length > 0;

  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};