import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8899);

/**
 * The @playwright/test version is pinned to ~1.56 on purpose: it is the release
 * whose bundled Chromium (build 1194) matches the browser preinstalled in the
 * Claude Code web sandbox, so the suite runs there with no extra download.
 * Locally, `npx playwright install chromium` fetches the same build.
 *
 * Drives the exported web bundle (react-native-web), not a native build.
 * That covers screen logic, navigation, form state and Amplify call handling;
 * it does not cover native modules, native layout, or the JSC engine the
 * iOS/Android builds actually run on.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // Every Cognito call is mocked, so a failure here is real, not flake.
  reporter: process.env.CI ? 'line' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile-web',
      // Phone-sized viewport: these are mobile screens and the layout is narrow.
      use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 900 } },
    },
  ],

  webServer: {
    command: `node e2e/serve.mjs`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
