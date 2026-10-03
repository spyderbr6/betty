import { defineFunction } from '@aws-amplify/backend';

export const deviceRegistry = defineFunction({
  name: 'device-registry',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
  },
  timeoutSeconds: 15,
  memoryMB: 256,
});
