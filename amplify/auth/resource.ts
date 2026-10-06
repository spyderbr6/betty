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
  // admins: the people who may approve deposits and withdrawals, resolve disputes and
  // release stuck squares games. Membership is checked by the money function
  // (shared/callerAuth.ts); the User.role field is display only. Add someone with the
  // Cognito console or `aws cognito-idp admin-add-user-to-group`.
  groups: ['bettors', 'moderators', 'admins'],
});
