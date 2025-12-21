import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { scheduledBetChecker } from './functions/scheduled-bet-checker/resource';
import { pushNotificationSender } from './functions/push-notification-sender/resource';
import { eventFetcher } from './functions/event-fetcher/resource';
import { payoutProcessor } from './functions/payout-processor/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  scheduledBetChecker,
  pushNotificationSender,
  eventFetcher,
  payoutProcessor,
  // Note: liveScoreUpdater removed - TheSportsDB score updates are too unreliable
});

// Add VAPID private key as a secret for push notification sender
const vapidPrivateKey = backend.addSecret('VAPID_PRIVATE_KEY');
backend.pushNotificationSender.addEnvironment('VAPID_PRIVATE_KEY', vapidPrivateKey);
