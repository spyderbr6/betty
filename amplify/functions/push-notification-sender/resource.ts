import { defineFunction } from '@aws-amplify/backend';

export const pushNotificationSender = defineFunction({
  name: 'push-notification-sender',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
    EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '',
    // Web Push VAPID keys for browser push notifications
    // Public key is safe to expose (used in client-side code)
    WEB_PUSH_PUBLIC_KEY: 'BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I',
    // VAPID_PRIVATE_KEY is added via backend.addSecret() - DO NOT hardcode here
    WEB_PUSH_EMAIL: 'mailto:admin@sidebet.app',
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});