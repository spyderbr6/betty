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

/**
 * Creates a Stripe Subscription and returns the clientSecret for the Payment Sheet.
 */
export async function createSubscription(): Promise<SubscriptionResult> {
  try {
    const result = await (client as any).mutations.createStripeManage({ action: 'create_subscription' });
    const data = result?.data;

    if (!data?.clientSecret) {
      return { success: false, error: 'Failed to create subscription. Please try again.' };
    }

    return {
      success: true,
      clientSecret: data.clientSecret,
      subscriptionId: data.subscriptionId,
    };
  } catch (error) {
    console.error('[StripeService] createSubscription error:', error);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Opens the Stripe Customer Portal so the user can manage or cancel their subscription.
 */
export async function openCustomerPortal(): Promise<void> {
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
    if (portalUrl) {
      await Linking.openURL(portalUrl);
    } else {
      console.error('[StripeService] No portal URL returned');
    }
  } catch (error) {
    console.error('[StripeService] openCustomerPortal error:', error);
  }
}
