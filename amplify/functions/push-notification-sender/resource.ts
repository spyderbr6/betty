import { defineFunction, secret } from '@aws-amplify/backend';

export const pushNotificationSender = defineFunction({
  name: 'push-notification-sender',
  entry: './handler.ts',
  environment: {
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || '',

    // secret(), not process.env: process.env is read from the shell at synth
    // time and baked into the CloudFormation template in plaintext, so a value
    // stored in SSM never reaches the function. Both of these are set as
    // secrets for the sandbox and the branch.
    EXPO_ACCESS_TOKEN: secret('EXPO_ACCESS_TOKEN'),
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),

    // Not secret: the VAPID public key and contact address are published to
    // browsers by design, so a plaintext default is fine here.
    WEB_PUSH_EMAIL: process.env.WEB_PUSH_EMAIL ?? 'mailto:admin@sidebet.app',
    WEB_PUSH_PUBLIC_KEY: process.env.WEB_PUSH_PUBLIC_KEY ?? 'BHREIE9gIc8ok6jMDRv0eGw_SUmAN77dav_Z5AJ1H8dM2oPBpk4YEvnIVP76-z2gqvZvkBsO9bxx_5Sk1BYlK9I',
  },
  timeoutSeconds: 30,
  memoryMB: 256,
});
