import React from 'react';
import { FriendRequestsModal } from 'sidebet-ui';

// Requests are loaded from AWS on open (no prop carries them). On the canvas
// the fetch rejects, so this shows the state the modal settles into.
export const Default = () => (
  <FriendRequestsModal visible onClose={() => {}} onRequestHandled={() => {}} />
);
