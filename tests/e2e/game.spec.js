import { test } from './fixtures.js';

test.describe('Space shooter', () => {
  test('a guest starts idle, then scores by firing', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();

    await homePage.expectIdleGame();
    await homePage.startGame();
    await homePage.expectMap();
    await homePage.enterLevel();
    await homePage.expectGameRunning();

    await homePage.holdFire();
    await homePage.expectScoreAbove(0);
    await homePage.expectXpAbove(0);
    await homePage.expectCoinsAbove(0);
    await homePage.releaseFire();
  });

  test('abandoning a run returns to the level it was on', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();

    await homePage.startGame();
    await homePage.enterLevel();
    await homePage.expectGameRunning();
    await homePage.abandonRun();
    await homePage.expectMap('level');
  });

  test('U opens the guns, a locked gun shows its level, and Back returns to the map', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();

    await homePage.expectIdleGame();
    await homePage.openUpgrades();
    await homePage.expectUpgrades();
    await homePage.focusBeam();
    await homePage.clickBack();
    await homePage.expectMap();
  });

  test('U during a run asks to abandon, and Yes opens the guns', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();

    await homePage.startGame();
    await homePage.enterLevel();
    await homePage.expectGameRunning();
    await homePage.abandonToUpgrades();
    await homePage.expectUpgrades();
    await homePage.closeUpgrades();
    await homePage.expectMap('level');
  });
});
