import type { Page, Route } from '@playwright/test';

/**
 * Cognito responses are faked at the HTTP boundary rather than by mocking the
 * `aws-amplify/auth` module, so the real SDK still parses the payloads and the
 * app still sees real AuthError shapes.
 *
 * These payloads encode our understanding of the Cognito wire format. If a test
 * passes here but the flow misbehaves against the real user pool, suspect these
 * fixtures first — capture an actual response and correct them.
 */

/** Cognito action name, e.g. 'ForgotPassword', taken from the X-Amz-Target header. */
type CognitoAction = string;
type Handler = (route: Route) => unknown;

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/x-amz-json-1.1',
  body: JSON.stringify(body),
});

export const ok = (body: unknown = {}) => () => json(200, body);

export const fail = (type: string, message: string) => () =>
  json(400, { __type: type, message });

export const codeDelivery = (destination = 'b***@g***.com') =>
  ok({ CodeDeliveryDetails: { AttributeName: 'email', DeliveryMedium: 'EMAIL', Destination: destination } });

/**
 * Intercept every Cognito call and answer from `handlers`, keyed by action name.
 *
 * Matching is by exact action, NOT substring: 'ConfirmForgotPassword' contains
 * 'ForgotPassword', and a substring match silently answers the confirm call with
 * the request call's response, turning a failing assertion green.
 *
 * Unhandled actions get a 500 and are recorded, so a test that forgets a handler
 * fails loudly instead of hanging.
 */
export async function mockCognito(page: Page, handlers: Record<CognitoAction, Handler>) {
  const calls: CognitoAction[] = [];

  await page.route('**/cognito-idp.*.amazonaws.com/**', async (route) => {
    const action = (route.request().headers()['x-amz-target'] ?? '').split('.').pop() ?? '';
    calls.push(action);

    const handler = handlers[action];
    if (!handler) {
      return route.fulfill(
        json(500, { __type: 'InternalErrorException', message: `e2e: no handler for ${action}` })
      );
    }
    return route.fulfill(handler(route) as Parameters<Route['fulfill']>[0]);
  });

  return { calls };
}
