/**
 * What the adminResolveDispute mutation's refusals mean for the admin, kept free of
 * Amplify imports so it is unit tested. The server decides (amplify/shared/disputeLogic.ts).
 */

export function disputeRefusalMessage(reason: string | undefined): string {
  switch (reason) {
    case 'NOT_ADMIN':
      return 'Your account is not in the admins group, so it cannot resolve disputes.';
    case 'NOT_OPEN':
      return 'This dispute has already been resolved.';
    case 'ALREADY_PAID':
      return 'This bet has already been paid out, so upholding the dispute cannot reverse it here. Handle the reversal manually.';
    case 'BUSY':
      return 'The bet changed while you were deciding. Reload and try again.';
    case 'NOT_FOUND':
      return 'The dispute or its bet no longer exists.';
    default:
      return 'Failed to resolve dispute. Please try again.';
  }
}
