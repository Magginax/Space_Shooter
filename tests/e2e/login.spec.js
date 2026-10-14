import { test, PASSWORD } from './fixtures.js';

test.describe('Login page', () => {
  test('home page nav opens it and BACK returns', async ({ homePage, loginPage }) => {
    await homePage.open();
    await homePage.clickNav('Login');
    await loginPage.expectLoaded();
    await loginPage.goBack();
    await homePage.expectLoaded();
  });

  test('shows the form and an animated LCD with 3 hearts', async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.expectState('idle');
    await loginPage.expectLoginForm();
    await loginPage.expectScene('animated');
    await loginPage.expectLives(3);
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the LCD scene is static', async ({ loginPage }) => {
      await loginPage.open();
      await loginPage.expectScene('static');
    });
  });

  test('invalid input is reported without asking the server', async ({ supabase, loginPage }) => {
    await loginPage.open();

    await loginPage.logIn('a!', PASSWORD);
    await loginPage.expectState('error');
    await loginPage.expectStatus(/Username must be 3-16 characters/);

    await loginPage.logIn('ace_pilot', 'short');
    await loginPage.expectStatus(/at least 8 characters/);
    supabase.expectNoRequests();
  });

  test('logs in with the username e-mail and shows the pilot and rank', async ({ supabase, loginPage }) => {
    supabase.withRole('admin');
    await loginPage.open();

    await loginPage.logIn('Ace_Pilot');

    await loginPage.expectSignedInAs('ace_pilot', 'ADMIN');
    await loginPage.expectBanner('STAGE CLEAR');
    supabase.expectLoginEmail('ace_pilot@players.space-shooter.local');
  });

  test('wrong password costs a heart; three wrong ones are GAME OVER', async ({ loginPage }) => {
    await loginPage.open();

    await loginPage.logIn('ace_pilot', 'wrong-pass');
    await loginPage.expectStatus('Wrong username or password');
    await loginPage.expectLives(2);

    await loginPage.submitAgain();
    await loginPage.expectLives(1);
    await loginPage.submitAgain();
    await loginPage.expectLives(0);
    await loginPage.expectBanner('GAME OVER');
    // The hearts come back after a moment.
    await loginPage.expectLives(3, { timeout: 5000 });
  });

  test('NEW PILOT registers through sign-up', async ({ supabase, loginPage }) => {
    await loginPage.open();

    await loginPage.switchToRegister();
    await loginPage.expectRegisterMode();
    await loginPage.logIn('rookie');

    await loginPage.expectSignedInAs('rookie', 'USER');
    supabase.expectSignUpEmail('rookie@players.space-shooter.local');
  });

  test('a taken username is reported', async ({ supabase, loginPage }) => {
    supabase.withTakenUsername('rookie');
    await loginPage.open();
    await loginPage.register('rookie');
    await loginPage.expectStatus('That username is taken');
    await loginPage.expectLives(3);
  });

  test('stays logged in after a reload, LOGOUT shows the form again', async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.logIn();
    await loginPage.expectState('signed-in');

    await loginPage.reload();
    await loginPage.expectSignedInAs('ace_pilot', 'USER');

    await loginPage.logOut();
    await loginPage.expectState('idle');
    await loginPage.expectLoginForm();
    await loginPage.reload();
    await loginPage.expectLoginForm();
  });

  test('no page errors while the scene runs and keys fire', async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.typeUsernameSlowly('ace_pilot');
    await loginPage.resizeWindow(1024, 700);
    await loginPage.letSceneRun();
    loginPage.expectNoPageErrors();
  });

  test('the password never ends up in the address bar', async ({ loginPage }) => {
    await loginPage.open();
    await loginPage.logIn('ace_pilot', 'wrong-pass');
    await loginPage.expectState('error');
    loginPage.expectPasswordNotInAddress('wrong-pass');
  });
});

test.describe('Login page: back to the game', () => {
  test('after login it returns to the page in ?next=', async ({ homePage, loginPage }) => {
    await loginPage.open({ next: '/#game' });
    await loginPage.logIn();
    await loginPage.expectStatus('RETURNING TO GAME...');
    await homePage.expectOnGame();
  });

  test('?next= pointing to another site is ignored', async ({ loginPage }) => {
    await loginPage.open({ next: 'https://evil.example/' });
    await loginPage.logIn();
    await loginPage.expectState('signed-in');
    await loginPage.waitLongerThanReturnDelay();
    await loginPage.expectStillHere();
    await loginPage.expectPlayLinkTo('/#game');
  });

  test('PLAY AS GUEST opens the game in guest mode, without asking the server', async ({ supabase, homePage, loginPage }) => {
    await loginPage.open({ next: '/#game' });
    await loginPage.playAsGuest();

    await homePage.expectOnGame();
    await homePage.expectPlayingAs('guest', { guest: true });
    supabase.expectNoLoginRequest();
  });
});

test.describe('Login page: profile', () => {
  test.beforeEach(async ({ supabase, loginPage }) => {
    await supabase.loginBeforeLoad('ace_pilot');
    await loginPage.open();
    await loginPage.openProfile();
    await loginPage.expectProfileOpen();
  });

  test('passcode change needs the current passcode', async ({ loginPage }) => {
    await loginPage.changePassword('wrong-guess', 'better-secret');
    await loginPage.expectStatus('Current password is wrong');
    await loginPage.expectLives(2);

    await loginPage.changePassword(PASSWORD, 'better-secret');
    await loginPage.expectStatus('PASSCODE CHANGED');
    await loginPage.expectPasswordFieldsCleared();
  });

  test('a short new passcode is refused before anything is sent', async ({ loginPage }) => {
    await loginPage.changePassword(PASSWORD, 'short');
    await loginPage.expectStatus(/at least 8 characters/);
  });
});
