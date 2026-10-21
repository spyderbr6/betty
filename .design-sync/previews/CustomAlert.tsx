import React from 'react';
import { CustomAlert } from 'sidebet-ui';

export const Confirm = () => (
  <CustomAlert
    visible
    title="Leave this bet?"
    message="Your $20 stake on Lakers will be refunded to your balance."
    buttons={[
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave Bet', style: 'destructive' },
    ]}
  />
);

export const Info = () => (
  <CustomAlert
    visible
    title="Dispute Filed"
    message="Your dispute has been submitted and will be reviewed by an administrator. The payout is now on hold."
  />
);
