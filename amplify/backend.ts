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
import { FunctionUrlAuthType, CfnPermission } from 'aws-cdk-lib/aws-lambda';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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

// Force CloudFormation to generate a new AppSync API Key (fixes expired/missing key on production stack)
backend.data.resources.cfnResources.cfnApiKey?.overrideLogicalId('recoverApiKey20260726');

// The stripe-webhook Lambda is reachable over two public endpoints: this Function URL
// and the API Gateway route defined further down. Stripe should be pointed at the API
// Gateway one (`StripeWebhookApiUrl`) — invoking this Function URL returns 403 in this
// AWS account. See the comment above the HttpApi below for the full reasoning.
const webhookFn = backend.stripeWebhook.resources.lambda;
const webhookUrl = webhookFn.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// Stripe calls this endpoint unauthenticated, so the URL needs a resource policy
// allowing anyone to invoke it. Without it AWS rejects the request with 403 before
// the handler runs — the request never reaches our signature check, which is what
// actually authenticates the caller.
//
// CDK's FunctionUrl construct already emits an equivalent permission whenever authType
// is NONE (see aws-cdk-lib/aws-lambda/lib/function-url.js), so this L1 is redundant and
// the deployed resource policy carries both statements. Kept deliberately: it is what
// lets us state with certainty that a missing invoke permission is NOT the cause of the
// 403 below. Do not "fix" the 403 by adding a third grant — that path is exhausted.
new CfnPermission(webhookFn.stack, 'StripeWebhookPublicInvoke', {
  action: 'lambda:InvokeFunctionUrl',
  functionName: webhookFn.functionArn,
  principal: '*',
  functionUrlAuthType: 'NONE',
});

new CfnOutput(backend.stack, 'StripeWebhookUrl', {
  value: webhookUrl.url,
  description: 'Lambda Function URL for the Stripe webhook (see StripeWebhookApiUrl)',
});

// --- API Gateway route to the same handler -----------------------------------
//
// Stripe deliveries to the Function URL above return 403. That 403 is produced by
// AWS before the handler runs, and every explanation this stack controls has been
// ruled out against the deployed resources: auth type is NONE, the resource policy
// grants anonymous lambda:InvokeFunctionUrl (twice — CDK adds one automatically for
// authType NONE, plus the explicit CfnPermission above), the URL configured in
// Stripe is the current one, and deploys succeed. Nothing left to fix in the app.
//
// What remains is the Function URL pathway itself — an SCP or Resource Control
// Policy denying anonymous invoke on Lambda Function URLs produces exactly this
// signature: deploys succeed, config looks correct, invocations 403 before Lambda.
//
// So route Stripe through API Gateway instead. It reaches the same handler with the
// same payload format (2.0), but invocation is authorized as apigateway.amazonaws.com
// against the function rather than as an anonymous caller against a Function URL, so
// it does not depend on public Function URLs being permitted at all.
//
// The Function URL is intentionally left in place — it costs nothing and keeps the
// old endpoint working if it ever starts responding.
const webhookApi = new HttpApi(webhookFn.stack, 'StripeWebhookApi', {
  apiName: 'stripe-webhook',
  description: 'Public HTTPS entrypoint for Stripe webhook deliveries',
});

webhookApi.addRoutes({
  path: '/stripe-webhook',
  // POST is what Stripe sends; GET serves the handler's health check so the endpoint
  // can be verified with curl without forging a signed Stripe payload.
  methods: [HttpMethod.POST, HttpMethod.GET],
  integration: new HttpLambdaIntegration('StripeWebhookIntegration', webhookFn),
});

// `apiEndpoint` has no trailing slash and the default stage is $default, so the
// route path appends directly.
const webhookApiUrl = `${webhookApi.apiEndpoint}/stripe-webhook`;

new CfnOutput(backend.stack, 'StripeWebhookApiUrl', {
  value: webhookApiUrl,
  description: 'Paste this URL into Stripe Dashboard → Developers → Webhooks',
});

// Publish both endpoints into amplify_outputs.json as well, so the live values can be
// diffed against what Stripe is configured with without AWS console access.
backend.addOutput({
  custom: {
    stripeWebhookApiUrl: webhookApiUrl,
    stripeWebhookFunctionUrl: webhookUrl.url,
  },
});
