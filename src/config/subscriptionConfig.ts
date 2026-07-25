// Platform fee rates and subscription config — update constants here to change fees app-wide
export const DEPOSIT_PROCESSING_FEE_RATE = 0.005; // 0.5% charged on deposits
export const WITHDRAWAL_FEE_RATE = 0.02;           // 2% charged on withdrawals
export const WINNINGS_FEE_RATE = 0.03;             // 3% charged on bet/squares winnings

export const PRO_SUBSCRIPTION_PRICE_CENTS = 499;   // $4.99/month — update here to change price
export const PRO_MONTHLY_DISPLAY = '$4.99';

export type SubscriptionTier = 'FREE' | 'PRO';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'TRIALING';
