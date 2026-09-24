import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Lambda logic only. The Playwright suite in e2e/ drives the app in a real
    // browser and must not be picked up by Vitest — the two runners both define
    // `test` and `expect`, and collide if their globs overlap.
    // Lambda logic, plus the pure money helpers in src/config. Narrow on
    // purpose: a broad src/**/__tests__ would start colliding with component
    // tests later, and e2e/ must stay out entirely.
    include: [
      'amplify/**/__tests__/**/*.test.ts',
      'src/config/__tests__/**/*.test.ts',
      'src/services/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});
