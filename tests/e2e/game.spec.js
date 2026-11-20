import { test } from './fixtures.js';

test.describe('Space shooter', () => {
  test('a guest starts idle, then scores by firing', async ({ supabase, gamePage }) => {
    await supabase.guestBeforeLoad();
    await gamePage.open();

    await gamePage.expectIdleGame();
    await gamePage.startGame();
    await gamePage.expectMap();
    await gamePage.enterLevel();
    await gamePage.expectGameRunning();

    await gamePage.holdFire();
    await gamePage.expectScoreAbove(0);
    await gamePage.expectXpAbove(0);
    await gamePage.expectCoinsAbove(0);
    await gamePage.releaseFire();
  });

  test('abandoning a run returns to the level it was on', async ({ supabase, gamePage }) => {
    await supabase.guestBeforeLoad();
    await gamePage.open();

    await gamePage.startGame();
    await gamePage.enterLevel();
    await gamePage.expectGameRunning();
    await gamePage.abandonRun();
    await gamePage.expectMap('level');
  });

  test('U opens the guns, a locked gun shows its level, and Back returns to the map', async ({ supabase, gamePage }) => {
    await supabase.guestBeforeLoad();
    await gamePage.open();

    await gamePage.expectIdleGame();
    await gamePage.openUpgrades();
    await gamePage.expectUpgrades();
    await gamePage.focusBeam();
    await gamePage.clickBack();
    await gamePage.expectMap();
  });

  test('U during a run asks to abandon, and Yes opens the guns', async ({ supabase, gamePage }) => {
    await supabase.guestBeforeLoad();
    await gamePage.open();

    await gamePage.startGame();
    await gamePage.enterLevel();
    await gamePage.expectGameRunning();
    await gamePage.abandonToUpgrades();
    await gamePage.expectUpgrades();
    await gamePage.closeUpgrades();
    await gamePage.expectMap('level');
  });
});
