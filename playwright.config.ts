import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/** The projects a pull request runs when PW_FAST is set. */
const FAST_PROJECTS = new Set(['chromium', 'Mobile Safari', 'supabase-chromium']);

export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /**
   * CI ran this suite one test at a time, which was most of why a review round
   * felt like it stalled on E2E. Measured on a 4-vCPU runner, the Chromium
   * project alone: 2m12s at one worker, 1m23s at two, 1m13s at three — and CI
   * runs three projects.
   *
   * Two is the default because the runner is also hosting both Vite dev
   * servers, and a starved worker fails as a timeout rather than as slowness,
   * which costs a retry and wipes out the saving. PW_WORKERS dials it up
   * without a code change if the runner turns out to have the headroom.
   *
   * Nothing here shares state between tests — each worker gets its own browser
   * context, so IndexedDB and the login session are already isolated.
   */
  workers: process.env.CI ? Number(process.env.PW_WORKERS || 2) : undefined,
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

  /* Configure projects for major browsers.

     PW_FAST trims the matrix to the two that earn their place on a pull
     request — Chromium, and Mobile Safari for the WebKit engine and the
     narrow layouts where this app's chrome actually differs — plus the
     Supabase project, which is Chromium too. Firefox, desktop WebKit and
     Mobile Chrome still run in full on every push to main, so nothing ships
     without them; they just stop costing six of the pipeline's eight minutes
     on every review round. See ALWAYS_PROJECTS below. */
  projects: (
    [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
            : {},
        },
        testIgnore: /contribution-loop|class-analytics-ranking/,
      },

      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
        testIgnore: /contribution-loop|class-analytics-ranking/,
      },

      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
        testIgnore: /contribution-loop|class-analytics-ranking/,
      },

      /* Test against mobile viewports. */
      {
        name: 'Mobile Chrome',
        use: { ...devices['Pixel 5'] },
        testIgnore: /contribution-loop|class-analytics-ranking/,
      },
      {
        name: 'Mobile Safari',
        use: { ...devices['iPhone 12'] },
        testIgnore: /contribution-loop|class-analytics-ranking/,
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
        testMatch: /contribution-loop|class-analytics-ranking/,
      },
    ] as const
  ).filter((project) => !process.env.PW_FAST || FAST_PROJECTS.has(project.name)),

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
