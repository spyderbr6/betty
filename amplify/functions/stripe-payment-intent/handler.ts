import { AppSyncResolverHandler } from 'aws-lambda';
import { generateClient } from 'aws-amplify/api';
import type { Schema } from '../../data/resource';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
// @ts-ignore - Generated at build time by Amplify
import { env } from '$amplify/env/stripe-payment-intent';
import Stripe from 'stripe';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>() as any;

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });

// Must match calculateDepositFee() in src/config/subscriptionConfig.ts
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_CENTS = 30;

/**
 * Fee (in cents) to add so the platform nets the full deposit after Stripe's cut.
 * Stripe deducts from the total charged, so the fee is grossed up:
 *   total = (deposit + fixed) / (1 - percent)
 * Rounded up so the platform is never short.
 */
function calculateDepositFeeCents(depositCents: number): number {
  const total = (depositCents + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_PERCENT_FEE);
  return Math.ceil(total - depositCents);
}

interface PaymentIntentArgs {
  amountCents: number;
}

interface PaymentIntentResult {
  clientSecret: string | null;
  paymentIntentId: string | null;
  transactionId: string | null;
  totalChargeCents: number | null;
}

export const handler: AppSyncResolverHandler<PaymentIntentArgs, PaymentIntentResult> = async (event) => {
  console.log('createStripePaymentIntent:', JSON.stringify(event.arguments));

  const userId = (event.identity as any)?.sub;
  if (!userId) {
    console.error('[StripePI] No userId in identity');
    return { clientSecret: null, paymentIntentId: null, transactionId: null, totalChargeCents: null };
  }

  const { amountCents } = event.arguments;

  if (!amountCents || amountCents < 500) { // $5 minimum
    console.error('[StripePI] Invalid amount:', amountCents);
    return { clientSecret: null, paymentIntentId: null, transactionId: null, totalChargeCents: null };
  }

  try {
    const { data: user } = await client.models.User.get({ id: userId });

    // Card processing is passed through at Stripe's cost for everyone — Pro's
    // benefit is 0% on withdrawals and winnings, not on card processing.
    const depositAmountCents = amountCents;
    const processingFeeCents = calculateDepositFeeCents(depositAmountCents);
    const totalChargeCents = depositAmountCents + processingFeeCents;
    const depositAmountDollars = depositAmountCents / 100;

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalChargeCents,
      currency: 'usd',
      metadata: {
        userId,
        depositAmountCents: String(depositAmountCents),
        processingFeeCents: String(processingFeeCents),
      },
    });

    // Create PENDING transaction record so balance updates when webhook fires
    const { data: transaction } = await client.models.Transaction.create({
      userId,
      type: 'DEPOSIT',
      status: 'PENDING',
      amount: depositAmountDollars,
      platformFee: processingFeeCents / 100,
      balanceBefore: user?.balance ?? 0,
      balanceAfter: (user?.balance ?? 0) + depositAmountDollars,
      stripePaymentIntentId: paymentIntent.id,
      notes: `Card deposit (card processing fee: $${(processingFeeCents / 100).toFixed(2)})`,
      createdAt: new Date().toISOString(),
    });

    console.log('[StripePI] PaymentIntent created:', paymentIntent.id);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      transactionId: transaction?.id ?? null,
      totalChargeCents,
    };
  } catch (error) {
    console.error('[StripePI] Error:', error);
    return { clientSecret: null, paymentIntentId: null, transactionId: null, totalChargeCents: null };
  }
};
