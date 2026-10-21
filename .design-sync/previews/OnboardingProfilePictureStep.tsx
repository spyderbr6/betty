import React from 'react';
import { OnboardingProfilePictureStep, View } from 'sidebet-ui';

const noop = () => {};
const frame = { width: 390, height: 680 };

// Inline avatar so the canvas needs no network.
const avatar =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs>
      <rect width="240" height="240" fill="url(#g)"/>
      <circle cx="120" cy="96" r="44" fill="#e2e8f0"/>
      <ellipse cx="120" cy="214" rx="78" ry="58" fill="#e2e8f0"/>
    </svg>`
  );

export const NoPicture = () => (
  <View style={frame}>
    <OnboardingProfilePictureStep profilePictureUrl="" onProfilePictureChange={noop} onNext={noop} onSkip={noop} />
  </View>
);

export const WithPicture = () => (
  <View style={frame}>
    <OnboardingProfilePictureStep profilePictureUrl={avatar} onProfilePictureChange={noop} onNext={noop} onSkip={noop} />
  </View>
);
