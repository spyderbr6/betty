import React from 'react';
import { SquaresInviteModal } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

// Friends are loaded from AWS on open; the game header comes from props.
export const Default = () => (
  <SquaresInviteModal
    visible
    onClose={() => {}}
    onInvitesSent={() => {}}
    game={{
      id: 'sq-7',
      title: 'Cowboys vs Eagles Squares',
      status: 'ACTIVE',
      totalPot: 340,
      squaresSold: 68,
      pricePerSquare: 5,
      creatorId: 'user-jordan',
      locksAt: hours(5),
    }}
  />
);
