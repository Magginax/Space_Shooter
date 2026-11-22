import { test } from './fixtures.js';

test.describe('Home page', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('has the site title', async ({ homePage }) => {
    await homePage.expectLoaded();
  });

  test('the Game link points at the game page', async ({ homePage }) => {
    await homePage.expectGameLink();
  });
});
