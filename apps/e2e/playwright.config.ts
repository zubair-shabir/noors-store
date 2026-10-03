import { defineConfig, devices } from '@playwright/test';
import { API_URL, BASE_URL } from './tests/support/env.js';

const CI = Boolean(process.env.CI);

/**
 * End-to-end tests of the buying journey against the production builds of the API and the
 * store (run `pnpm build` first). Both servers use the development stand-ins for Razorpay,
 * Shiprocket and email, so no keys are needed. The tests share one database, so they run
 * one at a time.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Shortens the intro splash and the page's motion.
    contextOptions: { reducedMotion: 'reduce' },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Sandboxes without browser downloads point this at a preinstalled Chromium.
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'node dist/server.js',
      cwd: '../api',
      url: `${API_URL}/api/v1/health`,
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        // development: the mock payment, shipping and email providers, and sign-in codes
        // shown on the form. Empty keys make sure real providers stay off.
        NODE_ENV: 'development',
        PORT: new URL(API_URL).port || '4000',
        DATABASE_URL:
          process.env.DATABASE_URL ?? 'postgresql://noors:noors@localhost:5432/noors?schema=public',
        CORS_ORIGINS: BASE_URL,
        STORE_URL: BASE_URL,
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RESEND_API_KEY: '',
        SHIPROCKET_EMAIL: '',
        SHIPROCKET_PASSWORD: '',
        CLOUDINARY_URL: '',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm exec next start --port ${new URL(BASE_URL).port || '3000'}`,
      cwd: '../web',
      url: BASE_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { API_URL, NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
