import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
      testIgnore: /contribution-loop/,
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /contribution-loop/,
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /contribution-loop/,
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      testIgnore: /contribution-loop/,
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      testIgnore: /contribution-loop/,
    },

    /* Supabase-mode app (second dev server below) with every Supabase/AI call
       stubbed via page.route — exercises the shared-library contribution loop
       UI without a live backend. Chromium only: the flows are not
       browser-sensitive and one deterministic run keeps CI fast.
       PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH lets environments with a
       preinstalled Chromium (but a different Playwright build pin) run the
       spec without downloading browsers; unset in CI. */
    {
      name: 'supabase-chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3100',
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
      testMatch: /contribution-loop/,
    },
  ],

  /* Dev servers: the default mock-mode app, plus a Supabase-configured
     instance (Vite bakes VITE_* env at serve time, so a separate server is the
     only way to get isSupabaseConfigured=true). The stub URL never resolves —
     the spec intercepts all requests to it. */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: 'https://stub.supabase.test',
        VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
      },
    },
  ],
});
