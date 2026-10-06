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

/** The smallest withdrawal, enforced by the app's form and by the server. */
export const MIN_WITHDRAWAL = 10;

/**
 * Fee on a withdrawal: the one place it is computed, by the server when the withdrawal is
 * requested and by the app's confirmation screen, so what the user is shown is what they
 * are charged. Pro waives it. (The confirmation screen used to show no fee at all while
 * 2% was recorded.)
 */
export function withdrawalFee(amount: number, isPro: boolean): number {
  if (isPro || amount <= 0) return 0;
  return Math.round(amount * WITHDRAWAL_FEE_RATE * 100) / 100;
}

/**
 * Platform fee on winnings. The only place this multiplication should happen.
 *
 * Pro waives it. Call sites used to compute the fee inline - ResolveScreen with
 * a hardcoded 0.03, squaresGameService with the rate constant - and neither
 * asked whether the winner was Pro, so Pro members were charged on both. The
 * squares path was worse than an oversight: its comment said Pro was "handled at
 * transaction level", and recordSquaresPayout said the fee was "already
 * calculated in SquaresGameService". Each deferred to the other and nobody
 * checked.
 *
 * Takes isPro rather than a userId so it stays pure and callers are forced to
 * have looked the subscription up.
 */
export function winningsFee(grossPayout: number, isPro: boolean): number {
  if (isPro || grossPayout <= 0) return 0;
  return Math.round(grossPayout * WINNINGS_FEE_RATE * 100) / 100;
}

/** Net winnings after the platform fee. */
export function netWinnings(grossPayout: number, isPro: boolean): number {
  return Math.round((grossPayout - winningsFee(grossPayout, isPro)) * 100) / 100;
}

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

interface SubscriptionFields {
  subscriptionTier?: string | null;
  subscriptionStatus?: string | null;
}

/**
 * Whether a user currently gets Pro benefits. The one place this is decided: fees, the
 * Account screen and the subscription screen used to each test it their own way, and the
 * Account screen (tier only) showed "Pro Membership · 0% fees" to cancelled and past-due
 * members who were being charged.
 *
 * TRIALING counts: the Stripe webhook grants the PRO tier for a trial, so a trial member
 * is entitled to the waiver.
 */
export function isProActive(user: SubscriptionFields | null | undefined): boolean {
  return (
    user?.subscriptionTier === 'PRO' &&
    (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'TRIALING')
  );
}

export type MembershipState = 'pro' | 'payment_issue' | 'free';

/**
 * What the profile shows about membership. PAST_DUE is called out on its own: the webhook
 * drops the tier to FREE while Stripe retries, and the member needs to know why their
 * benefits stopped.
 */
export function membershipState(user: SubscriptionFields | null | undefined): MembershipState {
  if (isProActive(user)) return 'pro';
  if (user?.subscriptionStatus === 'PAST_DUE') return 'payment_issue';
  return 'free';
}
