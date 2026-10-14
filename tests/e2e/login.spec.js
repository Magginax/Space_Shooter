import { test, expect } from '@playwright/test';
import { fakeSupabase, logIn, PASSWORD } from './support/fake-supabase.js';

const RETURN_TO_GAME = '/views/login.html?next=' + encodeURIComponent('/#game');

test.describe('Login page', () => {
  test('home page nav opens it and BACK returns', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Login' }).click();
    await expect(page).toHaveTitle('Login - Space_Shooter');
    await page.getByRole('link', { name: '< BACK' }).click();
    await expect(page).toHaveTitle('Space_Shooter');
  });

  test('shows the form and an animated LCD with 3 hearts', async ({ page }) => {
    await page.goto('/views/login.html');
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByLabel('PILOT ID', { exact: true })).toBeVisible();
    await expect(page.getByLabel('PASSCODE', { exact: true })).toHaveAttribute('type', 'password');
    await expect(page.getByTestId('lcd-canvas')).toHaveAttribute('data-state', 'animated');
    await expect(page.getByTestId('lcd-canvas')).toHaveAttribute('data-lives', '3');
  });

  test('is static with reduced motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/views/login.html');
    await expect(page.getByTestId('lcd-canvas')).toHaveAttribute('data-state', 'static');
    await context.close();
  });

  test('invalid input is reported without asking the server', async ({ page }) => {
    const { requests } = await fakeSupabase(page);
    await page.goto('/views/login.html');

    await logIn(page, 'a!', PASSWORD);
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'error');
    await expect(page.getByTestId('login-status')).toHaveText(/Username must be 3-16 characters/);

    await logIn(page, 'ace_pilot', 'short');
    await expect(page.getByTestId('login-status')).toHaveText(/at least 8 characters/);
    expect(requests).toHaveLength(0);
  });

  test('logs in with the username e-mail and shows the pilot and rank', async ({ page }) => {
    const { requests } = await fakeSupabase(page, { role: 'admin' });
    await page.goto('/views/login.html');

    await logIn(page, 'Ace_Pilot');

    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'signed-in');
    await expect(page.getByTestId('player-name')).toHaveText('ace_pilot');
    await expect(page.getByTestId('player-role')).toHaveText('ADMIN');
    await expect(page.getByTestId('login-form')).toBeHidden();
    await expect(page.getByTestId('banner')).toHaveText('STAGE CLEAR');
    const login = requests.find((r) => r.path === '/auth/v1/token');
    expect(login.body.email).toBe('ace_pilot@players.space-shooter.local');
  });

  test('wrong password costs a heart; three wrong ones are GAME OVER', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/views/login.html');
    const canvas = page.getByTestId('lcd-canvas');

    await logIn(page, 'ace_pilot', 'wrong-pass');
    await expect(page.getByTestId('login-status')).toHaveText('Wrong username or password');
    await expect(canvas).toHaveAttribute('data-lives', '2');

    await page.getByTestId('submit-button').click();
    await expect(canvas).toHaveAttribute('data-lives', '1');
    await page.getByTestId('submit-button').click();
    await expect(canvas).toHaveAttribute('data-lives', '0');
    await expect(page.getByTestId('banner')).toHaveText('GAME OVER');
    // The hearts come back after a moment.
    await expect(canvas).toHaveAttribute('data-lives', '3', { timeout: 5000 });
  });

  test('NEW PILOT registers through sign-up', async ({ page }) => {
    const { requests } = await fakeSupabase(page);
    await page.goto('/views/login.html');

    await page.getByRole('button', { name: 'NEW PILOT' }).click();
    await expect(page.getByRole('button', { name: 'NEW PILOT' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('PASSCODE', { exact: true })).toHaveAttribute('autocomplete', 'new-password');
    await logIn(page, 'rookie');

    await expect(page.getByTestId('player-name')).toHaveText('rookie');
    await expect(page.getByTestId('player-role')).toHaveText('USER');
    const signup = requests.find((r) => r.path === '/auth/v1/signup');
    expect(signup.body.email).toBe('rookie@players.space-shooter.local');
  });

  test('a taken username is reported', async ({ page }) => {
    await fakeSupabase(page, { takenUsername: 'rookie' });
    await page.goto('/views/login.html');
    await page.getByRole('button', { name: 'NEW PILOT' }).click();
    await logIn(page, 'rookie');
    await expect(page.getByTestId('login-status')).toHaveText('That username is taken');
    await expect(page.getByTestId('lcd-canvas')).toHaveAttribute('data-lives', '3');
  });

  test('stays logged in after a reload, LOGOUT shows the form again', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/views/login.html');
    await logIn(page);
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'signed-in');

    await page.reload();
    await expect(page.getByTestId('player-name')).toHaveText('ace_pilot');

    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('player-card')).toBeHidden();
  });

  test('no page errors while the scene runs and keys fire', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/views/login.html');
    await page.getByLabel('PILOT ID', { exact: true }).pressSequentially('ace_pilot', { delay: 30 });
    await page.setViewportSize({ width: 1024, height: 700 }); // the scene must survive a resize
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
});

test.describe('Login page: back to the game', () => {
  test('after login it returns to the page in ?next=', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto(RETURN_TO_GAME);
    await logIn(page);
    await expect(page.getByTestId('login-status')).toHaveText('RETURNING TO GAME...');
    await expect(page).toHaveURL(/\/#game$/);
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'granted');
  });

  test('?next= pointing to another site is ignored', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/views/login.html?next=' + encodeURIComponent('https://evil.example/'));
    await logIn(page);
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'signed-in');
    await page.waitForTimeout(2000); // longer than the return delay
    await expect(page).toHaveURL(/\/views\/login\.html/);
    await expect(page.getByTestId('play-link')).toHaveAttribute('href', '/#game');
  });

  test('PLAY AS GUEST opens the game in guest mode, without asking the server', async ({ page }) => {
    const { requests } = await fakeSupabase(page);
    await page.goto(RETURN_TO_GAME);
    await page.getByTestId('guest-button').click();

    await expect(page).toHaveURL(/\/#game$/);
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'granted');
    await expect(page.getByTestId('player-name')).toHaveText('guest');
    await expect(page.getByTestId('guest-note')).toBeVisible();
    expect(requests.filter((r) => r.path.startsWith('/auth/v1/token'))).toHaveLength(0);
  });
});

test.describe('Login page: profile', () => {
  test.beforeEach(async ({ page }) => {
    const fake = await fakeSupabase(page);
    await fake.loginBeforeLoad('ace_pilot');
    await page.goto('/views/login.html');
    await page.getByTestId('profile-button').click();
    await expect(page.getByTestId('login')).toHaveAttribute('data-view', 'profile');
  });

  test('rename changes the pilot ID everywhere', async ({ page }) => {
    await page.getByLabel('NEW PILOT ID').fill('Top_Gun');
    await page.getByRole('button', { name: 'RENAME' }).click();
    await expect(page.getByTestId('login-status')).toHaveText('PILOT ID CHANGED TO top_gun');

    await page.getByTestId('profile-back').click();
    await expect(page.getByTestId('player-name')).toHaveText('top_gun');
    // The new name also comes back after a reload.
    await page.reload();
    await expect(page.getByTestId('player-name')).toHaveText('top_gun');
  });

  test('rename to an invalid name is refused', async ({ page }) => {
    await page.getByLabel('NEW PILOT ID').fill('x');
    await page.getByRole('button', { name: 'RENAME' }).click();
    await expect(page.getByTestId('login-status')).toHaveText(/Username must be 3-16 characters/);
  });

  test('passcode change needs the current passcode', async ({ page }) => {
    await page.getByLabel('CURRENT PASSCODE').fill('wrong-guess');
    await page.getByLabel('NEW PASSCODE').fill('better-secret');
    await page.getByRole('button', { name: 'CHANGE PASSCODE' }).click();
    await expect(page.getByTestId('login-status')).toHaveText('Current password is wrong');
    await expect(page.getByTestId('lcd-canvas')).toHaveAttribute('data-lives', '2');

    await page.getByLabel('CURRENT PASSCODE').fill(PASSWORD);
    await page.getByRole('button', { name: 'CHANGE PASSCODE' }).click();
    await expect(page.getByTestId('login-status')).toHaveText('PASSCODE CHANGED');
    await expect(page.getByLabel('NEW PASSCODE')).toHaveValue('');
  });

  test('a short new passcode is refused before anything is sent', async ({ page }) => {
    await page.getByLabel('CURRENT PASSCODE').fill(PASSWORD);
    await page.getByLabel('NEW PASSCODE').fill('short');
    await page.getByRole('button', { name: 'CHANGE PASSCODE' }).click();
    await expect(page.getByTestId('login-status')).toHaveText(/at least 8 characters/);
  });
});

test('the password never ends up in the address bar', async ({ page }) => {
  await fakeSupabase(page);
  await page.goto('/views/login.html');
  await logIn(page, 'ace_pilot', 'wrong-pass');
  await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'error');
  expect(page.url()).not.toContain('wrong-pass');
});
