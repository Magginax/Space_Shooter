import { defineConfig } from '@playwright/test';

// Tests against the REAL Supabase database (URL and key from .env).
// Kept apart from playwright.config.js on purpose, so `npm test` and CI never
// write to it. Run with `npm run test:db`.
export default defineConfig({
  testDir: './tests/db',
  workers: 1, // one at a time: afterAll deletes the rows the tests wrote
  reporter: 'list',
});
