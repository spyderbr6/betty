import React from 'react';
import { WithdrawFundsModal } from 'sidebet-ui';

// Payment methods are fetched from AWS when the modal opens. On the canvas that
// fetch fails, so the modal shows its first step with no Venmo account linked.
export const NoPaymentMethod = () => (
  <WithdrawFundsModal visible onClose={() => {}} onSuccess={() => {}} onAddPaymentMethod={() => {}} />
);
