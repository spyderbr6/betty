import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Puts the app in a signed-in state without driving the login form.
 *
 * Sign-in itself is not replayable at the HTTP boundary: Amplify defaults to SRP,
 * where the client derives a shared secret and verifies the server's proof, so a
 * faked RespondToAuthChallenge is rejected by the real SDK. Instead we seed the
 * token store Amplify reads on boot, which is what a completed sign-in leaves
 * behind anyway. The login form itself is covered by auth.spec.ts.
 *
 * The tokens are unsigned. Nothing client-side verifies the signature — Amplify
 * only decodes the payload and checks expiry — and every call that would present
 * them to AWS is intercepted, so no real credential is involved.
 */

// Read at runtime rather than importing: Playwright transpiles specs to CJS, so
// import.meta is unavailable, and a static JSON import would need resolveJsonModule
// in the app's tsconfig. Playwright runs with cwd set to the config directory.
const authConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'amplify_outputs.json'), 'utf8')
).auth;
const clientId: string = authConfig.user_pool_client_id;

/**
 * The id token must carry a real `iss`. Amplify derives the identity-pool Logins
 * key from it, and a token without one fails with InvalidIdTokenException — which
 * surfaces only as a retry storm against the refresh endpoint.
 */
const issuer = `https://cognito-idp.${authConfig.aws_region}.amazonaws.com/${authConfig.user_pool_id}`;

const b64url = (value: object) =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A structurally valid JWT with no signature — see the note above. */
const token = (payload: object) =>
  `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;

/**
 * Answer the calls Amplify makes against a restored session.
 *
 * Seeding tokens alone is not enough: on boot Amplify refreshes them, and an
 * unmocked refresh hits the real user pool, returns 400, and Amplify responds by
 * CLEARING the stored tokens — so the app silently falls back to the login screen.
 * Refresh is mockable where sign-in is not, because REFRESH_TOKEN_AUTH involves no
 * SRP proof for the client to verify.
 */
async function mockSessionEndpoints(page: Page, account: typeof TEST_USER, exp: number) {
  const base = { sub: account.userId, exp, iat: Math.floor(Date.now() / 1000) };

  await page.route('**/cognito-idp.*.amazonaws.com/**', async (route) => {
    const action = (route.request().headers()['x-amz-target'] ?? '').split('.').pop() ?? '';

    // Current Amplify refreshes via GetTokensFromRefreshToken; older versions used
// InitiateAuth with REFRESH_TOKEN_AUTH. Both are answered so the fixture does not
// silently break on an SDK bump — an unmatched action returns {}, which Amplify
// reports only as "Unknown: An unknown error has occurred".
    const body =
      action === 'InitiateAuth' || action === 'GetTokensFromRefreshToken'
        ? {
            AuthenticationResult: {
              AccessToken: token({ ...base, token_use: 'access', username: account.username, client_id: clientId }),
              IdToken: token({ ...base, token_use: 'id',
      iss: issuer, 'cognito:username': account.username, email: account.email, aud: clientId }),
              RefreshToken: 'e2e-refresh-token',
              ExpiresIn: 3600,
              TokenType: 'Bearer',
            },
            ChallengeParameters: {},
          }
        : action === 'GetUser'
          ? {
              Username: account.username,
              UserAttributes: [
                { Name: 'sub', Value: account.userId },
                { Name: 'email', Value: account.email },
                { Name: 'email_verified', Value: 'true' },
              ],
            }
          : {};

    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify(body),
    });
  });

  // Identity-pool credentials for the same reason: an error here also tears down
  // the session, and the app never uses the returned credentials under test.
  await page.route('**/cognito-identity.*.amazonaws.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/x-amz-json-1.1',
      body: JSON.stringify({
        IdentityId: 'us-east-2:00000000-0000-0000-0000-000000000000',
        Credentials: {
          AccessKeyId: 'ASIAE2ETEST',
          SecretKey: 'e2e-secret',
          SessionToken: 'e2e-session',
          Expiration: exp,
        },
      }),
    });
  });
}

export const TEST_USER = {
  userId: 'e2e-user-0000-0000-000000000001',
  username: 'e2e-user',
  email: 'e2e@example.com',
  displayName: 'E2E Tester',
};

/**
 * Seed before navigation via addInitScript: AuthContext calls getCurrentUser()
 * during the first render, so tokens written after page.goto() would land too
 * late and the app would paint the login screen instead.
 */
export async function signInAs(page: Page, user: Partial<typeof TEST_USER> = {}) {
  const account = { ...TEST_USER, ...user };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60;
  const base = { sub: account.userId, exp, iat: Math.floor(Date.now() / 1000) };

  const prefix = `CognitoIdentityServiceProvider.${clientId}`;
  const entries: Record<string, string> = {
    [`${prefix}.LastAuthUser`]: account.username,
    [`${prefix}.${account.username}.accessToken`]: token({
      ...base,
      token_use: 'access',
      username: account.username,
      client_id: clientId,
    }),
    [`${prefix}.${account.username}.idToken`]: token({
      ...base,
      token_use: 'id',
      iss: issuer,
      'cognito:username': account.username,
      email: account.email,
      email_verified: true,
      aud: clientId,
    }),
    [`${prefix}.${account.username}.refreshToken`]: 'e2e-refresh-token',
    [`${prefix}.${account.username}.clockDrift`]: '0',
  };

  await mockSessionEndpoints(page, account, exp);

  await page.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) {
      window.localStorage.setItem(key, value as string);
    }
  }, entries);

  return account;
}
