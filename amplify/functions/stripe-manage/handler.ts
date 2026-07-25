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

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

interface ManageArgs {
  action: string;
  returnUrl?: string;
}

interface ManageResult {
  clientSecret: string | null;
  subscriptionId: string | null;
  portalUrl: string | null;
}

export const handler: AppSyncResolverHandler<ManageArgs, ManageResult> = async (event) => {
  const userId = (event.identity as any)?.sub;
  if (!userId) {
    return { clientSecret: null, subscriptionId: null, portalUrl: null };
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
      // Cancel any existing incomplete subscription first
      if (user.stripeSubscriptionId) {
        try {
          const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
          if (existing.status === 'incomplete' || existing.status === 'past_due') {
            await stripe.subscriptions.cancel(user.stripeSubscriptionId);
          } else if (existing.status === 'active' || existing.status === 'trialing') {
            // Already subscribed — return existing subscription's latest invoice
            const invoice = await stripe.invoices.retrieve(existing.latest_invoice as string);
            return {
              clientSecret: (invoice.payment_intent as Stripe.PaymentIntent)?.client_secret ?? null,
              subscriptionId: existing.id,
              portalUrl: null,
            };
          }
        } catch {
          // Subscription may have been deleted externally — proceed to create new one
        }
      }

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: env.STRIPE_PRO_PRICE_ID }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

      return {
        clientSecret: paymentIntent.client_secret,
        subscriptionId: subscription.id,
        portalUrl: null,
      };
    }

    if (action === 'customer_portal') {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || env.STRIPE_PORTAL_RETURN_URL,
      });
      return { clientSecret: null, subscriptionId: null, portalUrl: session.url };
    }

    console.error('[StripeManage] Unknown action:', action);
    return { clientSecret: null, subscriptionId: null, portalUrl: null };
  } catch (error) {
    console.error('[StripeManage] Error:', error);
    return { clientSecret: null, subscriptionId: null, portalUrl: null };
  }
};
