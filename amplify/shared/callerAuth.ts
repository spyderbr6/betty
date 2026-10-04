/**
 * Who called a resolver Lambda, decided from the AppSync identity.
 *
 * Internal operations (crediting a deposit, settling a bet) are custom mutations so other
 * Lambdas can reach them through AppSync with the IAM access they already have. Amplify
 * cannot restrict a custom mutation to "our own functions only", so the handler checks:
 *
 * - internal: an IAM principal in this AWS account that is not an app user. App users who
 *   reach the API with IAM do so through the Cognito identity pool, and those requests
 *   always carry a cognitoIdentityId; our Lambdas' roles never do. This is the same trust
 *   boundary as direct access to the tables.
 * - user: a Cognito user pool caller (the app), with their sub and groups.
 * - denied: anything else (an identity-pool user, another account, an API key).
 */

export type Caller =
  | { kind: 'internal'; arn: string }
  | { kind: 'user'; sub: string; groups: string[] }
  | { kind: 'denied'; reason: string };

export function classifyCaller(identity: unknown, ownAccountId: string): Caller {
  if (!identity || typeof identity !== 'object') return { kind: 'denied', reason: 'no identity' };
  const id = identity as Record<string, unknown>;

  // Cognito user pools: sub and claims
  if (typeof id.sub === 'string' && id.sub) {
    const groups = Array.isArray(id.groups) ? id.groups.filter((g): g is string => typeof g === 'string') : [];
    return { kind: 'user', sub: id.sub, groups };
  }

  // IAM: accountId and userArn
  if (typeof id.userArn === 'string' && typeof id.accountId === 'string') {
    if (id.cognitoIdentityId || id.cognitoIdentityPoolId) {
      return { kind: 'denied', reason: 'identity pool caller' };
    }
    if (id.accountId !== ownAccountId) {
      return { kind: 'denied', reason: 'other account' };
    }
    return { kind: 'internal', arn: id.userArn };
  }

  return { kind: 'denied', reason: 'unsupported identity' };
}

/** The account id from a Lambda's own ARN (context.invokedFunctionArn). */
export function accountIdFromArn(arn: string): string {
  return arn.split(':')[4] ?? '';
}

/** Admins are a Cognito group, checked here on the server; never a field users can write. */
export const ADMIN_GROUP = 'admins';

export function isAdmin(caller: Caller): boolean {
  return caller.kind === 'user' && caller.groups.includes(ADMIN_GROUP);
}
