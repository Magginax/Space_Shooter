import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has the site title', async ({ page }) => {
    await expect(page).toHaveTitle('Space_Shooter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Space_Shooter');
  });

  test('nav link scrolls to the game section', async ({ page }) => {
    await page.getByRole('link', { name: 'Game' }).click();
    await expect(page).toHaveURL(/#game$/);
    await expect(page.getByTestId('game-canvas')).toBeInViewport();
  });
});
