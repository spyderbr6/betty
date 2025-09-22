import { defineFunction } from '@aws-amplify/backend';

export const pushNotificationSender = defineFunction({
  name: 'push-notification-sender',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
    EXPO_ACCESS_TOKEN: process.env.EXPO_ACCESS_TOKEN || '', // For production, use environment variable
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});