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

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// Fee rates must match src/config/subscriptionConfig.ts
const DEPOSIT_PROCESSING_FEE_RATE = 0.005;

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
    // Check if user is Pro subscriber (no processing fee for Pro)
    const { data: user } = await client.models.User.get({ id: userId });
    const isPro = user?.subscriptionTier === 'PRO' && user?.subscriptionStatus === 'ACTIVE';

    const depositAmountCents = amountCents;
    const processingFeeCents = isPro ? 0 : Math.round(amountCents * DEPOSIT_PROCESSING_FEE_RATE);
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
      notes: `Card deposit${isPro ? '' : ` (0.5% processing fee: $${(processingFeeCents / 100).toFixed(2)})`}`,
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
