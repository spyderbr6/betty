import { defineFunction } from '@aws-amplify/backend';

export const pushNotificationSender = defineFunction({
  name: 'push-notification-sender',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
    EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '', // For production, use environment variable
    // Web Push VAPID keys for browser push notifications
    WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY || 'BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I',
    WEB_PUSH_PRIVATE_KEY: process.env.WEB_PUSH_PRIVATE_KEY || '5mP6mB3zo2uCI_im241K2QB0VC-ToVI-gGSUYMqbhFw',
    WEB_PUSH_EMAIL: process.env.WEB_PUSH_EMAIL || 'mailto:admin@sidebet.app',
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});