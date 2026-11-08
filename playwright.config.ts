import { defineConfig } from '@playwright/test';

// Runs against the production build: `npm run build` first.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:4330',
    channel: 'chrome',
    locale: 'en-GB',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node e2e/serve.mjs dist/finans-takip/browser 4330',
    url: 'http://localhost:4330',
    reuseExistingServer: true,
  },
});
