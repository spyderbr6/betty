import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Lambda logic only. The Playwright suite in e2e/ drives the app in a real
    // browser and must not be picked up by Vitest — the two runners both define
    // `test` and `expect`, and collide if their globs overlap.
    include: ['amplify/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
