import { defineFunction } from '@aws-amplify/backend';

export const scheduledSquaresChecker = defineFunction({
  name: 'scheduled-squares-checker',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 300, // 5 minutes timeout
  memoryMB: 512,
  schedule: [
    "*/5 * * * ? *"  // Run every 5 minutes
  ]
});
