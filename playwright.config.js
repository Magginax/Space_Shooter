import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,          // fail CI if a test.only was left in
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [
    ['list'],
    // noSnippets: no source code next to every step, a big part of the report
    // once many tests fail (the error message still shows the failing line).
    ['html', { open: 'never', noSnippets: true }],
    ['junit', { outputFile: 'test-results/junit.xml' }], // read by Jenkins
  ],
  // On CI Playwright would put the whole git diff of the commit into the report.
  captureGitInfo: { commit: true, diff: false },
  // No screenshots, videos or traces. When ~200 tests failed (x3 with retries)
  // they made the HTML report too big for Jenkins to open. Tests check
  // data-state/data-testid, not pixels, so the error message is enough.
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    // Plain JS modules tested in Node, no browser needed.
    { name: 'unit', testDir: './tests/unit' },
    // Browser tests against the built site.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Tests run against the production build, the same files GitHub Pages serves.
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 120_000,
    // A fake Supabase address baked into the test build: pages behave as
    // "configured" and the tests answer its requests with page.route(), so the
    // real database is never reached, even when .env exists (these win over .env).
    env: {
      VITE_SUPABASE_URL: 'https://supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    },
  },
});
