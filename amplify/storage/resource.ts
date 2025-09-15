import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'sidebet-user-uploads',
  access: (allow) => ({
    'profile-pictures/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ],
    'public/*': [
      allow.guest.to(['read']),
      allow.authenticated.to(['read', 'write', 'delete'])
    ]
  })
});