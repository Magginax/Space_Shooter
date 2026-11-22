import { test } from './fixtures.js';

test.describe('Game needs a login', () => {
  test('without login the game page sends visitors to login', async ({ gamePage, loginPage }) => {
    await gamePage.open();
    await loginPage.expectReturnAddressToGame();
  });

  test('logging in returns to the game', async ({ gamePage, loginPage }) => {
    await gamePage.open();
    await loginPage.expectReturnAddressToGame();

    await loginPage.logIn();
    await gamePage.expectOnGame();
    await gamePage.expectPlayingAs('ace_pilot');
  });

  test('a logged-in player opens the game straight away', async ({ supabase, gamePage }) => {
    await supabase.loginBeforeLoad();
    await gamePage.open();
    await gamePage.expectPlayingAs('ace_pilot');
  });

  test('a made-up login token does not start the game', async ({ supabase, gamePage, loginPage }) => {
    // The token is in localStorage, but the database refuses it.
    supabase.refuseLoginToken();
    await supabase.loginBeforeLoad('hacker');
    await gamePage.open();
    await loginPage.expectReturnAddressToGame();
  });

  test('guests can play and are told that scores are not saved', async ({ supabase, gamePage }) => {
    await supabase.guestBeforeLoad();
    await gamePage.open();
    await gamePage.expectPlayingAs('guest', { guest: true });
  });

  test('logging in ends guest mode', async ({ supabase, loginPage }) => {
    await supabase.guestBeforeLoad();
    await loginPage.open();
    await loginPage.logIn();
    await loginPage.expectState('signed-in');
    await supabase.expectGuestModeOff();
  });
});
