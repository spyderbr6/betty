import React from 'react';
import { QRScannerModal } from 'sidebet-ui';

// The modal asks expo-camera for permission on open; the answer decides
// whether it shows a spinner, the permission prompt, or the live camera.
export const Default = () => (
  <QRScannerModal visible onClose={() => {}} onBetScanned={() => {}} />
);
