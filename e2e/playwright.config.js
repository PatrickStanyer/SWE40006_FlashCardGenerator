import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against an already-deployed environment, never a local dev
// server. CD sets BASE_URL to the Staging host; the fallback lets anyone run
// `npm test` in this folder and hit Staging directly.
const BASE_URL = process.env.BASE_URL || 'http://54.252.251.138:8080';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.(js|ts)/,
  // A smoke suite should be quick. A slow LLM reply on a live key still fits.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry absorbs a cold container on the first request after a deploy,
  // without hiding a real failure.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
