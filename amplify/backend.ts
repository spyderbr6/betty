import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { scheduledBetChecker } from './functions/scheduled-bet-checker/resource';
import { pushNotificationSender } from './functions/push-notification-sender/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  scheduledBetChecker,
  pushNotificationSender,
});
