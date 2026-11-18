import { test as base } from '@playwright/test';
import { FakeSupabase } from './support/FakeSupabase.js';
import { ErrorPage } from './pages/ErrorPage.js';
import { HomePage } from './pages/HomePage.js';
import { LeaderboardPage } from './pages/LeaderboardPage.js';
import { LoginPage } from './pages/LoginPage.js';

export { PASSWORD } from './support/FakeSupabase.js';

/**
 * Every e2e spec imports `test` from here instead of from @playwright/test.
 * A test then simply asks for what it needs:
 *
 *   test('...', async ({ supabase, homePage, loginPage }) => { ... });
 *
 * Specs only call methods of these objects; selectors and checks live in
 * pages/*.js and support/FakeSupabase.js.
 */
export const test = base.extend({
  // auto: set up for every test, even when the test does not ask for it, so
  // requests to the fake Supabase address are always answered.
  supabase: [
    async ({ page }, use) => {
      const supabase = new FakeSupabase(page);
      await supabase.install();
      await use(supabase);
    },
    { auto: true },
  ],
  errorPage: async ({ page }, use) => {
    await use(new ErrorPage(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  leaderboardPage: async ({ page }, use) => {
    await use(new LeaderboardPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});
