// Platform fee rates and subscription config — update constants here to change fees app-wide

// --- Card processing (deposits) -------------------------------------------
// Stripe's US card pricing. The deposit fee is a pass-through: we charge exactly
// what Stripe takes so the platform nets the full deposit amount, no more, no less.
// Verify against https://stripe.com/pricing before changing.
export const STRIPE_PERCENT_FEE = 0.029; // 2.9%
export const STRIPE_FIXED_FEE = 0.3; // $0.30 per successful charge

/**
 * Fee to add to a deposit so the platform nets the full deposit amount.
 *
 * Stripe takes its cut from the TOTAL charged, so the fee has to be grossed up:
 *   total = (deposit + fixed) / (1 - percent)
 *
 * Rounded up to the cent so the platform is never left short.
 *
 * This is identical for Free and Pro members — it is Stripe's cost, not a
 * platform margin. Pro's benefit is 0% on withdrawals and winnings.
 */
export function calculateDepositFee(depositDollars: number): number {
  if (depositDollars <= 0) return 0;
  const total = (depositDollars + STRIPE_FIXED_FEE) / (1 - STRIPE_PERCENT_FEE);
  return Math.ceil((total - depositDollars) * 100) / 100;
}

// --- Platform fees (waived for Pro) ---------------------------------------
export const WITHDRAWAL_FEE_RATE = 0.02; // 2% charged on withdrawals
export const WINNINGS_FEE_RATE = 0.03; // 3% charged on bet/squares winnings

// --- Pro subscription ------------------------------------------------------
export const PRO_SUBSCRIPTION_PRICE_CENTS = 499; // $4.99/month — update here to change price
export const PRO_MONTHLY_DISPLAY = '$4.99';

export type SubscriptionTier = 'FREE' | 'PRO';
// Mirrors the User.subscriptionStatus enum in amplify/data/resource.ts. INCOMPLETE is
// the state a subscription sits in between creation and its first successful payment.
export type SubscriptionStatus =
  | 'ACTIVE'
  | 'CANCELLED'
  | 'PAST_DUE'
  | 'TRIALING'
  | 'INCOMPLETE';
