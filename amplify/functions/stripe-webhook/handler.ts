import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/stripe-webhook';
import Stripe from 'stripe';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>() as any;

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Health check. Stripe only ever POSTs, so a GET is always a human checking
  // whether this endpoint is the one Stripe should be pointing at.
  //
  // This exists because a Function URL that has been replaced (any rolled-back or
  // recreated deploy mints a new hostname) returns 403 — the exact same response as
  // a missing invoke permission. The two are otherwise indistinguishable from
  // outside AWS. Curl the URL configured in Stripe: a 200 here means the hostname is
  // live and this handler runs, so any delivery failure is signature/handler-side.
  // A 403 means the request never reached Lambda and the URL is stale or blocked.
  const method = event.requestContext?.http?.method?.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        service: 'stripe-webhook',
        status: 'ok',
        // Booleans only — never echo the secrets themselves onto a public endpoint.
        stripeSecretKeyConfigured: Boolean(env.STRIPE_SECRET_KEY),
        webhookSecretConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
        time: new Date().toISOString(),
      }),
    };
  }

  // Header names arrive lowercased through Function URLs, but check both to be safe.
  const headers = event.headers ?? {};
  const sig = headers['stripe-signature'] ?? headers['Stripe-Signature'];

  // Signature verification hashes the EXACT bytes Stripe sent. Lambda Function URLs
  // base64-encode the body depending on content type, so decode before verifying —
  // otherwise every event fails verification and deposits stay PENDING forever.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body ?? '';

  if (!sig) {
    console.error('[StripeWebhook] Missing stripe-signature header');
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('[StripeWebhook] STRIPE_WEBHOOK_SECRET is not set — check Amplify Secrets');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[StripeWebhook] Signature verification failed:', err, {
      isBase64Encoded: event.isBase64Encoded,
      bodyLength: rawBody.length,
    });
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  console.log('[StripeWebhook] Event:', stripeEvent.type, stripeEvent.id);

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(stripeEvent.data.object as Stripe.PaymentIntent);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(stripeEvent.data.object as Stripe.Subscription, false);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionChange(stripeEvent.data.object as Stripe.Subscription, true);
        break;

      default:
        console.log('[StripeWebhook] Unhandled event type:', stripeEvent.type);
    }
  } catch (error) {
    console.error('[StripeWebhook] Handler error:', error);
    return { statusCode: 500, body: 'Handler error' };
  }

  return { statusCode: 200, body: 'OK' };
};

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { userId, depositAmountCents } = paymentIntent.metadata;
  if (!userId || !depositAmountCents) {
    console.error('[StripeWebhook] Missing metadata on PaymentIntent:', paymentIntent.id);
    return;
  }

  const depositAmountDollars = parseInt(depositAmountCents, 10) / 100;

  // Find the transaction by stripePaymentIntentId, through the index of the same name.
  //
  // This was previously Transaction.list({ filter: { stripePaymentIntentId } }), which
  // is not a lookup at all — a filtered list compiles to a DynamoDB Scan that reads a
  // single page of the table in arbitrary order and applies the filter to just that
  // page. Every non-card transaction (bet placements, winnings, refunds, squares) shares
  // the table, so once it outgrew one page a given deposit stopped being found: the
  // handler logged "No transaction found", returned 200, and the deposit sat PENDING
  // forever while Stripe reported the delivery as successful.
  const { data: transactions, errors } = await client.models.Transaction.transactionsByStripePaymentIntentId({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (errors?.length) {
    // Throw rather than return: the outer catch turns this into a 500 so Stripe retries.
    // Swallowing it would strand a real payment.
    console.error('[StripeWebhook] Transaction lookup failed:', paymentIntent.id, JSON.stringify(errors));
    throw new Error('Transaction lookup failed');
  }

  const pendingTx = transactions?.find((t: any) => t.status === 'PENDING');
  if (!pendingTx) {
    const already = transactions?.find((t: any) => t.status === 'COMPLETED');
    if (already) {
      // Stripe retries webhooks; this one was already settled. Nothing to do.
      console.log('[StripeWebhook] PaymentIntent already settled, skipping:', paymentIntent.id);
      return;
    }
    // Any PaymentIntent reaching this point was created by stripe-payment-intent, which
    // writes the PENDING row before returning the client secret — so a missing row means
    // the write is not visible yet (index propagation) rather than absent. Fail so Stripe
    // retries with backoff instead of 200-ing and stranding the deposit; the already-settled
    // branch above keeps those retries from double-crediting.
    console.error('[StripeWebhook] No transaction found for PaymentIntent:', paymentIntent.id, {
      matchesFound: transactions?.length ?? 0,
      statuses: transactions?.map((t: any) => t.status),
    });
    throw new Error(`No transaction found for PaymentIntent ${paymentIntent.id}`);
  }

  // Get current balance
  const { data: user } = await client.models.User.get({ id: userId });
  if (!user) {
    console.error('[StripeWebhook] User not found:', userId);
    return;
  }

  const newBalance = (user.balance ?? 0) + depositAmountDollars;

  // Update transaction to COMPLETED
  await client.models.Transaction.update({
    id: pendingTx.id,
    status: 'COMPLETED',
    balanceBefore: user.balance ?? 0,
    balanceAfter: newBalance,
    completedAt: new Date().toISOString(),
  });

  // Credit user balance
  await client.models.User.update({ id: userId, balance: newBalance });

  console.log(`[StripeWebhook] Deposit completed for user ${userId}: +$${depositAmountDollars} → balance $${newBalance}`);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription, deleted: boolean) {
  // Find user by stripeCustomerId, through the index of the same name. Same reasoning as
  // the deposit lookup above: a filtered list is a paged Scan, not a lookup, so it would
  // quietly stop resolving subscribers once the User table outgrew a single scan page.
  const customerId = subscription.customer as string;
  const { data: users, errors } = await client.models.User.usersByStripeCustomerId({
    stripeCustomerId: customerId,
  });

  if (errors?.length) {
    console.error('[StripeWebhook] User lookup failed:', customerId, JSON.stringify(errors));
    throw new Error('User lookup failed');
  }

  const user = users?.[0];
  if (!user) {
    // Deliberately not retried, unlike the deposit path. A PaymentIntent gets there only
    // after its metadata proves we created it, so a missing row is our bug. A subscription
    // event carries no such proof — it may belong to a customer created straight in the
    // Stripe dashboard, and retrying that until Stripe disables the endpoint helps nobody.
    console.error('[StripeWebhook] No user found for Stripe customer:', customerId);
    return;
  }

  if (deleted) {
    await client.models.User.update({
      id: user.id,
      subscriptionTier: 'FREE',
      subscriptionStatus: 'CANCELLED',
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    });
    console.log(`[StripeWebhook] Subscription cancelled for user ${user.id}`);
    return;
  }

  const status = subscription.status;
  const periodEnd = new Date((subscription as any).current_period_end * 1000).toISOString();
  const isActive = status === 'active' || status === 'trialing';

  await client.models.User.update({
    id: user.id,
    subscriptionTier: isActive ? 'PRO' : 'FREE',
    subscriptionStatus: status.toUpperCase() as any,
    stripeSubscriptionId: subscription.id,
    subscriptionCurrentPeriodEnd: periodEnd,
  });

  console.log(`[StripeWebhook] Subscription ${status} for user ${user.id} until ${periodEnd}`);
}
