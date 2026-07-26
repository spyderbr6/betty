/**
 * Web stub for @stripe/stripe-react-native.
 * The native SDK uses codegen native modules that can't run on web.
 * Payment Sheet flows are mobile-only; web users see an appropriate message.
 */
import React from 'react';

export const StripeProvider: React.FC<{ children: React.ReactNode; [key: string]: any }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const useStripe = () => ({
  initPaymentSheet: async () => ({ error: { code: 'Unsupported', message: 'Payments require the mobile app.' } }),
  presentPaymentSheet: async () => ({ error: { code: 'Unsupported', message: 'Payments require the mobile app.' } }),
  confirmPayment: async () => ({ error: { code: 'Unsupported', message: 'Payments require the mobile app.' } }),
  createPaymentMethod: async () => ({ error: { code: 'Unsupported', message: 'Payments require the mobile app.' } }),
});
