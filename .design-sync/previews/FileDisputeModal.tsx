import React from 'react';
import { FileDisputeModal } from 'sidebet-ui';

const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const bet = {
  id: 'bet-44',
  title: 'Lakers beat the Celtics tonight',
  description: 'Regular season game at Crypto.com Arena. Final score, overtime counts.',
  category: 'SPORTS' as const,
  status: 'RESOLVED' as const,
  creatorId: 'user-sam',
  creatorName: 'Sam Rivera',
  totalPot: 80,
  betAmount: 20,
  odds: { sideAName: 'Lakers', sideBName: 'Celtics' },
  deadline: hours(-10),
  winningSide: 'B',
  disputeWindowEndsAt: hours(38),
  sideACount: 2,
  sideBCount: 2,
  participantUserIds: ['user-sam', 'user-ava', 'user-jordan', 'user-noah'],
  createdAt: hours(-30),
  updatedAt: hours(-9),
};

export const WithResolution = () => (
  <FileDisputeModal
    visible
    onClose={() => {}}
    userId="user-jordan"
    bet={{ ...bet, resolutionReason: 'Celtics won 112-108 per the ESPN box score.' }}
  />
);

export const NoResolutionNote = () => (
  <FileDisputeModal visible onClose={() => {}} userId="user-jordan" bet={bet} />
);
