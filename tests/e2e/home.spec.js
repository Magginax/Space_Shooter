import { test } from './fixtures.js';

test.describe('Home page', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
  });

  test('has the site title', async ({ homePage }) => {
    await homePage.expectLoaded();
  });

  test('nav link scrolls to the game section', async ({ homePage }) => {
    await homePage.clickNav('Game');
    await homePage.expectScrolledToGame();
  });
});
