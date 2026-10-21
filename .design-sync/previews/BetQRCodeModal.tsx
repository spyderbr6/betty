import React from 'react';
import { BetQRCodeModal } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

export const Default = () => (
  <BetQRCodeModal
    visible
    onClose={() => {}}
    bet={{
      id: 'bet-31',
      title: 'Who wins the office fantasy league?',
      description: 'Final standings after Week 17. Tiebreak is total points scored.',
      category: 'CUSTOM',
      status: 'ACTIVE',
      creatorId: 'user-jordan',
      creatorName: 'Jordan Miles',
      totalPot: 60,
      betAmount: 15,
      odds: { sideAName: 'Priya', sideBName: 'Marcus' },
      deadline: hours(72),
      sideACount: 2,
      sideBCount: 2,
      participantUserIds: ['user-jordan', 'user-priya', 'user-marcus', 'user-ava'],
      createdAt: hours(-30),
      updatedAt: hours(-2),
    }}
  />
);
