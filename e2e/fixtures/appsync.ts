import type { Page, Route } from '@playwright/test';

/**
 * AppSync is faked at the HTTP boundary for the same reason Cognito is: the real
 * Amplify client still builds the query, parses the response and applies its own
 * error handling, so a shape mismatch fails here rather than silently in prod.
 *
 * Subscriptions are deliberately NOT mocked. They run over a websocket to the
 * realtime endpoint, and BetDataContext attaches an `error:` handler to every one
 * of them that only logs. Letting them fail keeps the fixture small and still
 * exercises the initial-load path the screens render from.
 */

type Operation = string;
type Handler = (variables: Record<string, unknown>) => unknown;

/** A Gen2 `.list()` result. `items` is what the contexts destructure. */
export const list = (items: unknown[] = []) => () => ({ items, nextToken: null });

/** A Gen2 `.get()` result. */
export const one = (item: unknown) => () => item;

/**
 * Identify the call by its first selected field rather than the operation name.
 * Amplify sends anonymous documents — `query ($filter: X) { listBets(...) }` — so
 * matching on the operation name yields '' for every request. The first field in
 * the outer selection set is the model operation, and is also the key the client
 * reads the result back out of.
 */
const operationOf = (query: string): Operation => query.match(/\{\s*(\w+)/)?.[1] ?? '';

/**
 * Answer every GraphQL call from `handlers`, keyed by operation name
 * (e.g. 'listBets', 'getUser').
 *
 * An unhandled operation resolves to `null` rather than erroring: the app fires a
 * wide fan-out of queries on login, and failing them all would mask the one screen
 * under test. Unhandled names are recorded so a test can assert on them, and the
 * first unparsed body is kept so a shape change is diagnosable.
 */
export async function mockAppSync(page: Page, handlers: Record<Operation, Handler>) {
  const calls: Operation[] = [];
  const unhandled: Operation[] = [];
  const samples: string[] = [];

  // Matched by predicate rather than glob: the endpoint is
  // <id>.appsync-api.<region>.amazonaws.com, and a '**/' glob segment expects a '/'
  // before 'appsync-api' where the URL has a '.', so a glob matches nothing and
  // every query silently escapes to the real network.
  await page.route(
    (url) => url.hostname.includes('appsync-api'),
    async (route: Route) => {
      const raw = route.request().postData() ?? '';
      let body: { query?: string; variables?: Record<string, unknown> } = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // Leave body empty; the request is reported as unhandled below.
      }

      const operation = operationOf(body.query ?? '');
      calls.push(operation);

      const handler = handlers[operation];
      if (!handler) {
        unhandled.push(operation);
        if (samples.length < 3) samples.push(raw.slice(0, 400));
      }

      const data = handler ? handler(body.variables ?? {}) : null;

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { [operation]: data } }),
      });
    }
  );

  return { calls, unhandled, samples };
}
