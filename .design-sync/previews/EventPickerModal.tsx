import React from 'react';
import { EventPickerModal } from 'sidebet-ui';

// The modal fetches upcoming events itself (eventCacheService -> Amplify) and
// takes no event data through props. Amplify is not configured on the canvas,
// so the fetch fails and the modal settles on its "No Upcoming Events" state.

const noop = () => {};

export const Open = () => <EventPickerModal visible onSelect={noop} onClose={noop} />;
