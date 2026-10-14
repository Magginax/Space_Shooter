import { test, expect } from '@playwright/test';
import { fakeSupabase, guestBeforeLoad, logIn } from './support/fake-supabase.js';

test.describe('Game needs a login', () => {
  test('without login the game is locked', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/');
    const section = page.getByTestId('game-section');
    await expect(section).toHaveAttribute('data-access', 'locked');
    await expect(page.getByTestId('game-lock')).toBeVisible();
    await expect(page.getByTestId('game-area')).toBeHidden();
    // The About section stays public.
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  });

  test('"Log in" goes to the login page and back to the game', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/');
    await page.getByTestId('login-to-play').click();
    await expect(page).toHaveURL(/\/views\/login\.html\?next=%2F%23game$/);

    await logIn(page);
    await expect(page).toHaveURL(/\/#game$/);
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'granted');
    await expect(page.getByTestId('player-name')).toHaveText('ace_pilot');
    await expect(page.getByTestId('guest-note')).toBeHidden();
  });

  test('a direct link to the game sends visitors to the login page', async ({ page }) => {
    await fakeSupabase(page);
    await page.goto('/#game');
    await expect(page).toHaveURL(/\/views\/login\.html\?next=%2F%23game$/);
  });

  test('a direct link works straight away for logged-in players', async ({ page }) => {
    const fake = await fakeSupabase(page);
    await fake.loginBeforeLoad('ace_pilot');
    await page.goto('/#game');
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'granted');
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-state', 'running');
  });

  test('a made-up login token does not unlock the game', async ({ page }) => {
    // The token is in localStorage, but the database refuses it.
    const fake = await fakeSupabase(page, { profileStatus: 401 });
    await fake.loginBeforeLoad('hacker');
    await page.goto('/');
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'locked');
  });

  test('guests can play and are told that scores are not saved', async ({ page }) => {
    await fakeSupabase(page);
    await guestBeforeLoad(page);
    await page.goto('/#game');
    await expect(page.getByTestId('game-section')).toHaveAttribute('data-access', 'granted');
    await expect(page.getByTestId('player-name')).toHaveText('guest');
    await expect(page.getByTestId('guest-note')).toHaveText('(guest: scores are not saved)');
  });

  test('logging in ends guest mode', async ({ page }) => {
    await fakeSupabase(page);
    await guestBeforeLoad(page);
    await page.goto('/views/login.html');
    await logIn(page);
    await expect(page.getByTestId('login')).toHaveAttribute('data-state', 'signed-in');

    // addInitScript would set guest mode again on the next load, so check storage directly.
    const guest = await page.evaluate(() => localStorage.getItem('space_shooter.guest'));
    expect(guest).toBeNull();
  });
});
