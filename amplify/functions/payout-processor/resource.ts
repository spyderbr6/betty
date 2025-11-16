import { defineFunction } from '@aws-amplify/backend';

export const payoutProcessor = defineFunction({
  name: 'payout-processor',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 300, // 5 minutes timeout
  memoryMB: 512,
  schedule: [
    "*/5 * * * ? *"  // Every 5 minutes - check for completed dispute windows
  ]
});
