import { defineFunction } from '@aws-amplify/backend';

export const stripePaymentIntent = defineFunction({
  name: 'stripe-payment-intent',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});
