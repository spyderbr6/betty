import { AppSyncResolverHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/stripe-manage';
import Stripe from 'stripe';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>() as any;

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });

interface ManageArgs {
  action: string;
  returnUrl?: string;
}

interface ManageResult {
  clientSecret: string | null;
  subscriptionId: string | null;
  portalUrl: string | null;
  /** The user already has a paid-up subscription — there is nothing to charge. */
  alreadyActive: boolean | null;
  /** User-safe reason this call could not do what was asked, or null on success. */
  error: string | null;
}

const EMPTY: ManageResult = {
  clientSecret: null,
  subscriptionId: null,
  portalUrl: null,
  alreadyActive: null,
  error: null,
};

/**
 * Failure text for the caller, chosen by action.
 *
 * Deliberately does not carry the underlying Stripe message: those name price IDs,
 * customer IDs and account configuration, none of which belongs on a client that any
 * signed-in user can call. The detail is logged instead — see CloudWatch for the cause.
 */
function failureMessage(action: string): string {
  return action === 'customer_portal'
    ? 'Could not open the billing portal. Please try again.'
    : 'Could not start your subscription. Please try again.';
}

/**
 * Current period end as an ISO string, or null.
 *
 * `current_period_end` moved from the Subscription onto its items in API version
 * 2025-03-31.basil. The soonest item end is the one that matters — it is the point at
 * which access stops being paid for. Mirrors `getCurrentPeriodEnd` in the webhook handler.
 */
function currentPeriodEnd(subscription: Stripe.Subscription): string | null {
  const ends = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((end): end is number => typeof end === 'number' && Number.isFinite(end));

  if (!ends.length) return null;
  return new Date(Math.min(...ends) * 1000).toISOString();
}

export const handler: AppSyncResolverHandler<ManageArgs, ManageResult> = async (event) => {
  const userId = (event.identity as any)?.sub;
  if (!userId) {
    return { ...EMPTY, error: 'You must be signed in to manage a subscription.' };
  }

  const { action, returnUrl } = event.arguments;
  console.log('[StripeManage] action:', action, 'userId:', userId);

  try {
    const { data: user } = await client.models.User.get({ id: userId });
    if (!user) throw new Error(`User not found: ${userId}`);

    // Get or create Stripe Customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
        email: user.email ?? undefined,
        name: user.displayName ?? user.username ?? undefined,
      });
      customerId = customer.id;
      await client.models.User.update({ id: userId, stripeCustomerId: customerId });
    }

    if (action === 'create_subscription') {
      // Look up any subscription we have already recorded for this user.
      //
      // Scoped tightly to the retrieve, and nothing else runs inside this catch. The
      // fall-through from here is "create a new subscription", so anything swallowed in
      // this block bills the user a second time — an incidental failure must never reach
      // it. Only a genuinely unresolvable subscription id may.
      let existing: Stripe.Subscription | null = null;
      if (user.stripeSubscriptionId) {
        try {
          existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        } catch (err) {
          console.warn('[StripeManage] Could not retrieve recorded subscription:', user.stripeSubscriptionId, err);
          existing = null;
        }
      }

      if (existing && (existing.status === 'active' || existing.status === 'trialing')) {
        // Already subscribed. There is no open payment to collect, so there is no client
        // secret to hand back — this used to return the paid invoice's PaymentIntent
        // secret, which the Payment Sheet cannot do anything with. Say so explicitly
        // instead, so the caller can reconcile rather than showing this user a failure.
        console.log('[StripeManage] Subscription already active:', existing.id);

        // Reconcile the stored record against Stripe while we are here.
        //
        // Stripe is the authority on who is paying, and this is the one path a user
        // reaches by asking to subscribe when they already do. Without this, someone
        // whose webhook never landed is stuck: charged every month, told "you're already
        // Pro", and still paying Free-tier fees with no way out. The webhook remains the
        // normal path — this only catches what it missed.
        if (user.subscriptionTier !== 'PRO' || user.subscriptionStatus !== 'ACTIVE') {
          console.warn('[StripeManage] Reconciling stale tier for user:', userId, {
            storedTier: user.subscriptionTier,
            storedStatus: user.subscriptionStatus,
            stripeStatus: existing.status,
          });
          try {
            await client.models.User.update({
              id: userId,
              subscriptionTier: 'PRO',
              subscriptionStatus: existing.status === 'trialing' ? 'TRIALING' : 'ACTIVE',
              stripeSubscriptionId: existing.id,
              subscriptionCurrentPeriodEnd: currentPeriodEnd(existing),
            });
          } catch (err) {
            // Best-effort. Reporting the subscription as active is still correct and is
            // what keeps this user from being charged twice.
            console.error('[StripeManage] Reconciliation failed:', userId, err);
          }
        }

        return { ...EMPTY, subscriptionId: existing.id, alreadyActive: true };
      }

      // Cancel a stale unpaid subscription so the retry does not leave one behind.
      if (existing && (existing.status === 'incomplete' || existing.status === 'past_due')) {
        try {
          await stripe.subscriptions.cancel(existing.id);
        } catch (err) {
          console.warn('[StripeManage] Could not cancel stale subscription:', existing.id, err);
        }
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: env.STRIPE_PRO_PRICE_ID }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        // The Invoice has carried no `payment_intent` field since API version
        // 2025-03-31.basil; the secret needed to confirm the first charge now lives on
        // `confirmation_secret`, which is only returned when explicitly expanded.
        // Expanding the old path is not merely undefined at runtime — Stripe rejects an
        // unknown expand path outright, so this whole call used to fail.
        expand: ['latest_invoice.confirmation_secret'],
      });

      // Narrowing cast: `latest_invoice` is `string | Invoice | null`, and it is an
      // Invoice here because it was expanded above.
      const invoice = subscription.latest_invoice as Stripe.Invoice | null;
      const clientSecret = invoice?.confirmation_secret?.client_secret ?? null;

      // Record the subscription now rather than waiting for the webhook. If webhook
      // delivery is broken or delayed, the incomplete-subscription cleanup above still
      // has an ID to work with, so retrying an abandoned upgrade reuses one subscription
      // instead of leaving a new incomplete one behind on every attempt.
      //
      // Not allowed to fail the request: the subscription exists in Stripe by now, and
      // refusing to return its client secret over a bookkeeping write would block a user
      // from paying for a subscription they already have pending.
      if (user.stripeSubscriptionId !== subscription.id) {
        try {
          await client.models.User.update({ id: userId, stripeSubscriptionId: subscription.id });
        } catch (err) {
          console.error('[StripeManage] Could not record subscription id:', subscription.id, err);
        }
      }

      if (!clientSecret) {
        // Reachable without any exception being thrown — e.g. a $0 invoice that Stripe
        // auto-finalizes as paid. Report it rather than dereferencing null, which is how
        // this failure previously surfaced: a TypeError swallowed by the catch below.
        console.error('[StripeManage] No confirmation secret on subscription invoice', {
          subscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          invoiceId: invoice?.id,
          invoiceStatus: invoice?.status,
        });
        return { ...EMPTY, subscriptionId: subscription.id, error: failureMessage(action) };
      }

      return { ...EMPTY, clientSecret, subscriptionId: subscription.id, alreadyActive: false };
    }

    if (action === 'customer_portal') {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || env.STRIPE_PORTAL_RETURN_URL,
      });
      return { ...EMPTY, portalUrl: session.url };
    }

    console.error('[StripeManage] Unknown action:', action);
    return { ...EMPTY, error: failureMessage(action) };
  } catch (error) {
    // Logged in full, returned as a safe message — see failureMessage above.
    console.error('[StripeManage] Error:', action, error);
    return { ...EMPTY, error: failureMessage(action) };
  }
};
