import { test } from './fixtures.js';

test.describe('Game needs a login', () => {
  test('without login the game is locked', async ({ homePage }) => {
    await homePage.open();
    await homePage.expectGameLocked();
  });

  test('"Log in" goes to the login page and back to the game', async ({ homePage, loginPage }) => {
    await homePage.open();
    await homePage.clickLogInToPlay();
    await loginPage.expectReturnAddressToGame();

    await loginPage.logIn();
    await homePage.expectOnGame();
    await homePage.expectPlayingAs('ace_pilot');
  });

  test('a direct link to the game sends visitors to the login page', async ({ homePage, loginPage }) => {
    await homePage.openGameLink();
    await loginPage.expectReturnAddressToGame();
  });

  test('a direct link works straight away for logged-in players', async ({ supabase, homePage }) => {
    await supabase.loginBeforeLoad();
    await homePage.openGameLink();
    await homePage.expectPlayingAs('ace_pilot');
  });

  test('a made-up login token does not unlock the game', async ({ supabase, homePage }) => {
    // The token is in localStorage, but the database refuses it.
    supabase.refuseLoginToken();
    await supabase.loginBeforeLoad('hacker');
    await homePage.open();
    await homePage.expectGameLocked();
  });

  test('guests can play and are told that scores are not saved', async ({ supabase, homePage }) => {
    await supabase.guestBeforeLoad();
    await homePage.openGameLink();
    await homePage.expectPlayingAs('guest', { guest: true });
  });

  test('logging in ends guest mode', async ({ supabase, loginPage }) => {
    await supabase.guestBeforeLoad();
    await loginPage.open();
    await loginPage.logIn();
    await loginPage.expectState('signed-in');
    await supabase.expectGuestModeOff();
  });
});
