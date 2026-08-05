import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { Linking, Platform } from 'react-native';
import { calculateDepositFee } from '../config/subscriptionConfig';

const client = generateClient<Schema>();

export interface DepositResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface SubscriptionResult {
  success: boolean;
  clientSecret?: string;
  subscriptionId?: string;
  /**
   * The user is already subscribed, so there is nothing to pay and no `clientSecret`.
   * Not a failure — the local tier is simply behind Stripe and needs refreshing.
   */
  alreadyActive?: boolean;
  error?: string;
}

/**
 * Calculate how much will be charged for a desired deposit amount.
 * Returns { depositAmount, processingFee, totalCharge } all in dollars.
 *
 * The processing fee is Stripe's actual cost passed through, so it is the same
 * for Free and Pro members.
 */
export function calculateDepositCharge(depositDollars: number) {
  const processingFee = calculateDepositFee(depositDollars);
  return {
    depositAmount: depositDollars,
    processingFee,
    totalCharge: depositDollars + processingFee,
  };
}

/**
 * Creates a Stripe PaymentIntent on the backend and returns the clientSecret
 * needed to initialize the Stripe Payment Sheet.
 */
export async function createPaymentIntent(depositDollars: number): Promise<{
  clientSecret: string;
  transactionId: string;
  totalChargeCents: number;
} | null> {
  try {
    const amountCents = Math.round(depositDollars * 100);
    const result = await (client as any).mutations.createStripePaymentIntent({ amountCents });
    const data = result?.data;

    if (!data?.clientSecret) {
      console.error('[StripeService] No clientSecret returned:', result);
      return null;
    }

    return {
      clientSecret: data.clientSecret,
      transactionId: data.transactionId,
      totalChargeCents: data.totalChargeCents,
    };
  } catch (error) {
    console.error('[StripeService] createPaymentIntent error:', error);
    return null;
  }
}

export type DepositSettlement =
  | { status: 'COMPLETED'; balanceAfter: number | null }
  | { status: 'FAILED' }
  | { status: 'TIMEOUT' };

/**
 * Waits for a card deposit to actually be credited.
 *
 * Confirming the payment with Stripe only means Stripe took the money — the balance is
 * credited later and out of band, when the stripe-webhook Lambda settles the Transaction
 * row. Telling the user "added!" at confirmation time is therefore a guess, and it was
 * wrong for every deposit while the webhook was broken.
 *
 * This polls the very row the webhook settles, so a confirmation is evidence rather than
 * an assumption. `balanceAfter` is the balance the webhook itself computed and wrote.
 *
 * Polling rather than subscribing on purpose: the wait is short and bounded, and a missed
 * subscription event would hang the UI with no way to notice.
 */
export async function waitForDepositToSettle(
  transactionId: string,
  { timeoutMs = 20000, intervalMs = 1500 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<DepositSettlement> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Cast for the same reason as the mutations in this file: typing the call directly
      // trips TS2590 ("union type too complex") on the generated Schema, as it does across
      // the services layer. The narrow shape we rely on is asserted below instead.
      const { data: tx } = await (client as any).models.Transaction.get({ id: transactionId });
      const status: string | undefined = tx?.status;

      if (status === 'COMPLETED') {
        const balanceAfter: unknown = tx?.balanceAfter;
        return {
          status: 'COMPLETED',
          balanceAfter: typeof balanceAfter === 'number' ? balanceAfter : null,
        };
      }
      if (status === 'FAILED' || status === 'CANCELLED') {
        return { status: 'FAILED' };
      }
    } catch (error) {
      // Swallow and keep polling: one failed read should not end the wait early, and a
      // TIMEOUT is reported honestly as "not confirmed yet" rather than as a failure.
      console.warn('[StripeService] Settlement poll failed:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: 'TIMEOUT' };
}

/**
 * Creates a Stripe Subscription and returns the clientSecret for the Payment Sheet.
 */
export async function createSubscription(): Promise<SubscriptionResult> {
  try {
    const result = await (client as any).mutations.createStripeManage({ action: 'create_subscription' });
    const data = result?.data;

    // Already subscribed: no payment to collect, and reporting a failure here would push
    // a paying member to try again and risk a second charge.
    if (data?.alreadyActive) {
      return { success: true, alreadyActive: true, subscriptionId: data.subscriptionId };
    }

    if (!data?.clientSecret) {
      // GraphQL-level errors never reach `data`, so log the whole result — an empty
      // payload with no `error` means the mutation itself failed, not the Lambda.
      console.error('[StripeService] No clientSecret returned:', JSON.stringify(result));
      return {
        success: false,
        error: data?.error ?? 'Failed to create subscription. Please try again.',
      };
    }

    return {
      success: true,
      clientSecret: data.clientSecret,
      subscriptionId: data.subscriptionId,
      alreadyActive: false,
    };
  } catch (error) {
    console.error('[StripeService] createSubscription error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}

export type SubscriptionActivation = { status: 'ACTIVE' } | { status: 'TIMEOUT' };

/**
 * Waits for a subscription payment to actually be reflected on the user's tier.
 *
 * Same reasoning as `waitForDepositToSettle` above: a confirmed Payment Sheet only means
 * Stripe took the money. `User.subscriptionTier` is set out of band by the stripe-webhook
 * Lambda, so announcing "you're Pro now" at confirmation time is a guess — and it was the
 * wrong guess for every upgrade while the webhook was misrouted, which is precisely how a
 * charged user was left on the Free tier with the app congratulating them.
 *
 * Polls the very record the webhook writes, so the confirmation is evidence.
 */
export async function waitForSubscriptionToActivate(
  userId: string,
  { timeoutMs = 20000, intervalMs = 1500 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<SubscriptionActivation> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // Cast for the same reason as elsewhere in this file — see waitForDepositToSettle.
      const { data: user } = await (client as any).models.User.get({ id: userId });
      if (user?.subscriptionTier === 'PRO' && user?.subscriptionStatus === 'ACTIVE') {
        return { status: 'ACTIVE' };
      }
    } catch (error) {
      // One failed read should not end the wait early.
      console.warn('[StripeService] Subscription poll failed:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Deliberately no FAILED case. Unlike a deposit, nothing writes a terminal failure
  // state here, so the only honest answer short of ACTIVE is "not confirmed yet".
  return { status: 'TIMEOUT' };
}

/**
 * Opens the Stripe Customer Portal so the user can manage or cancel their subscription.
 */
export async function openCustomerPortal(): Promise<{ success: boolean; error?: string }> {
  try {
    // Where Stripe sends the user's browser after they finish in the portal.
    // A custom scheme cannot be followed by a web browser, so web needs a real URL.
    const returnUrl =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'sidebet://account';

    const result = await (client as any).mutations.createStripeManage({
      action: 'customer_portal',
      returnUrl,
    });
    const portalUrl = result?.data?.portalUrl;

    if (!portalUrl) {
      // The most likely cause is the Customer Portal not being enabled for this Stripe
      // mode (Dashboard → Settings → Billing → Customer Portal), which fails per-mode —
      // so this can work in test and fail in live. CloudWatch has Stripe's own message.
      console.error('[StripeService] No portal URL returned:', JSON.stringify(result));
      return {
        success: false,
        error: result?.data?.error ?? 'Could not open the billing portal. Please try again.',
      };
    }

    await Linking.openURL(portalUrl);
    return { success: true };
  } catch (error) {
    console.error('[StripeService] openCustomerPortal error:', error);
    return { success: false, error: 'Could not open the billing portal. Please try again.' };
  }
}
