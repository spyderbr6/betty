import React from 'react';
import { NotificationModal } from 'sidebet-ui';

// Wraps NotificationScreen, which loads the feed from AWS on open; no prop
// carries notifications in, so this shows the screen's settled state.
export const Default = () => <NotificationModal visible onClose={() => {}} />;
