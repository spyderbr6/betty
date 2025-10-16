import { defineFunction } from '@aws-amplify/backend';

export const eventFetcher = defineFunction({
  name: 'event-fetcher',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 300, // 5 minutes timeout
  memoryMB: 512,
  schedule: [
    "*/15 * * * ? *"  // Run every 15 minutes
  ]
});
