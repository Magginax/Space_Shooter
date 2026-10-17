import { test } from './fixtures.js';

test.describe('Space shooter', () => {
  test('a guest starts idle, then scores by firing', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();

    await homePage.expectIdleGame();
    await homePage.startGame();
    await homePage.expectGameRunning();

    await homePage.holdFire();
    await homePage.expectScoreAbove(0);
    await homePage.releaseFire();
  });
});
