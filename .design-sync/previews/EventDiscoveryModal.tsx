import React from 'react';
import { EventDiscoveryModal } from 'sidebet-ui';

// Events come from the event cache (AWS) on open; there is no prop to pass
// them in, so the canvas shows the modal's empty state.
export const Default = () => (
  <EventDiscoveryModal visible onClose={() => {}} onEventSelect={() => {}} currentUserId="user-jordan" />
);
