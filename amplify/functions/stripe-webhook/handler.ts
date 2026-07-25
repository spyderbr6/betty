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

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const sig = event.headers?.['stripe-signature'];
  const rawBody = event.body ?? '';

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig!, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[StripeWebhook] Signature verification failed:', err);
    return { statusCode: 400, body: 'Webhook signature verification failed' };
  }

  console.log('[StripeWebhook] Event:', stripeEvent.type);

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

  // Find the pending transaction by stripePaymentIntentId
  const { data: transactions } = await client.models.Transaction.list({
    filter: { stripePaymentIntentId: { eq: paymentIntent.id } },
  });

  const pendingTx = transactions?.find((t: any) => t.status === 'PENDING');
  if (!pendingTx) {
    console.error('[StripeWebhook] No pending transaction for PaymentIntent:', paymentIntent.id);
    return;
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
  // Find user by stripeCustomerId
  const customerId = subscription.customer as string;
  const { data: users } = await client.models.User.list({
    filter: { stripeCustomerId: { eq: customerId } },
  });

  const user = users?.[0];
  if (!user) {
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
  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
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
