import React from 'react';
import { PolicyModal } from 'sidebet-ui';

const close = () => {};

export const TermsOfService = () => <PolicyModal visible policyType="terms" onClose={close} />;

export const PrivacyPolicy = () => <PolicyModal visible policyType="privacy" onClose={close} />;
