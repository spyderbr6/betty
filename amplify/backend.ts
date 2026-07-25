import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { scheduledBetChecker } from './functions/scheduled-bet-checker/resource';
import { scheduledSquaresChecker } from './functions/scheduled-squares-checker/resource';
import { pushNotificationSender } from './functions/push-notification-sender/resource';
import { eventFetcher } from './functions/event-fetcher/resource';
import { payoutProcessor } from './functions/payout-processor/resource';
import { stripePaymentIntent } from './functions/stripe-payment-intent/resource';
import { stripeWebhook } from './functions/stripe-webhook/resource';
import { stripeManage } from './functions/stripe-manage/resource';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { CfnOutput } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  storage,
  scheduledBetChecker,
  scheduledSquaresChecker,
  pushNotificationSender,
  eventFetcher,
  payoutProcessor,
  stripePaymentIntent,
  stripeWebhook,
  stripeManage,
  // Note: liveScoreUpdater removed - TheSportsDB score updates are too unreliable
});

// Expose the stripe-webhook Lambda via a public Function URL so Stripe can call it.
// After deployment, copy the URL from CloudFormation outputs and paste it into
// the Stripe dashboard under Developers → Webhooks.
const webhookFn = backend.stripeWebhook.resources.lambda;
const webhookUrl = webhookFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});
new CfnOutput(backend.stack, 'StripeWebhookUrl', {
  value: webhookUrl.url,
  description: 'Paste this URL into Stripe Dashboard → Developers → Webhooks',
});
