import React from 'react';
import { AddFriendModal } from 'sidebet-ui';

// Opens on the empty search state: the modal only queries users once the
// viewer types, so nothing is fetched on mount.
export const Default = () => (
  <AddFriendModal visible onClose={() => {}} onRequestSent={() => {}} />
);
