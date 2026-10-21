import React from 'react';
import { BetInviteModal } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

// Friends are loaded from AWS on open; the bet header comes from props.
export const Default = () => (
  <BetInviteModal
    visible
    onClose={() => {}}
    onInvitesSent={() => {}}
    bet={{
      id: 'bet-12',
      title: 'Chiefs cover -3.5 against the Bills',
      description: 'Sunday night game at Arrowhead. Spread is locked at kickoff.',
      category: 'SPORTS',
      status: 'ACTIVE',
      creatorId: 'user-jordan',
      creatorName: 'Jordan Miles',
      totalPot: 75,
      betAmount: 25,
      odds: { sideAName: 'Chiefs -3.5', sideBName: 'Bills +3.5' },
      deadline: hours(6),
      sideACount: 2,
      sideBCount: 1,
      participantUserIds: ['user-jordan', 'user-ava', 'user-li'],
      createdAt: hours(-4),
      updatedAt: hours(-1),
    }}
  />
);
