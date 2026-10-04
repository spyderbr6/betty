import type { Page } from '@playwright/test';

/** A 1x1 PNG, enough for the image picker, resizer and upload to treat as a photo. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

export interface S3Call {
  method: string;
  /** Object key, URL-decoded, without the bucket host. */
  key: string;
}

/**
 * Answer S3 at the HTTP boundary, like the Cognito and AppSync fixtures.
 *
 * Matched by predicate for the same reason as AppSync: the host is
 * `<bucket>.s3.<region>.amazonaws.com`. Without this the upload would go to the bucket
 * in the local amplify_outputs.json, where the fixture's fake credentials are refused.
 */
export async function mockS3(page: Page) {
  const calls: S3Call[] = [];
  await page.route(
    (url) => /\.s3[.-][a-z0-9-]*\.?amazonaws\.com$/.test(url.hostname) || /^s3[.-]/.test(url.hostname),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
      calls.push({ method: request.method(), key });

      if (request.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 });
      }
      if (request.method() === 'DELETE') {
        return route.fulfill({ status: 204 });
      }
      // PUT (single-part upload). The SDK reads the ETag from the response.
      return route.fulfill({
        status: 200,
        headers: { ETag: '"e2e-etag"', 'Access-Control-Expose-Headers': 'ETag' },
        body: '',
      });
    }
  );
  return { calls };
}
