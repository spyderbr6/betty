import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource for SideBet betting platform
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    // Additional user attributes for betting platform
    preferredUsername: {
      required: true,
    }
  },
  groups: ['bettors', 'moderators'],
});
