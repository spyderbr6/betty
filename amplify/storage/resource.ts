import { defineStorage } from '@aws-amplify/backend';

// A member of any Cognito group signs in with that group's IAM role instead of the
// authenticated role (the identity pool maps roles from the token), so every group needs
// the same access as a signed-in user. Without it the owner, in `admins`, could not
// upload or view profile pictures.
const USER_POOL_GROUPS = ['bettors', 'moderators', 'admins'];

export const storage = defineStorage({
  name: 'sidebet-user-uploads',
  access: (allow) => ({
    'profile-pictures/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ],
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete']),
      allow.groups(USER_POOL_GROUPS).to(['read', 'write', 'delete'])
    ]
  })
});
