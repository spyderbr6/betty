/**
 * Policy Version Constants
 *
 * Update these version numbers when the Terms of Service or Privacy Policy
 * are significantly updated to require user re-acceptance.
 */

export const CURRENT_TOS_VERSION = '1.0';
export const CURRENT_PRIVACY_VERSION = '1.0';

/**
 * Policy acceptance is required during signup and whenever policies are updated.
 * When bumping versions:
 * 1. Update the version constant above
 * 2. Update the actual policy content in TermsOfServiceScreen.tsx or PrivacyPolicyScreen.tsx
 * 3. Existing users will be prompted to re-accept on next login (future feature)
 */
