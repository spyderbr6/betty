import { defineFunction } from '@aws-amplify/backend';

export const stripeManage = defineFunction({
  name: 'stripe-manage',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || '',
    STRIPE_PORTAL_RETURN_URL: process.env.STRIPE_PORTAL_RETURN_URL || 'sidebet://account',
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});
