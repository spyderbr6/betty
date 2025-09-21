import { defineFunction } from '@aws-amplify/backend';

export const scheduledBetChecker = defineFunction({
  name: 'scheduled-bet-checker',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 300, // 5 minutes timeout
  memoryMB: 512,
});