import { test, expect } from '@playwright/test';

test.describe('Dodge game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('starts idle with score 0', async ({ page }) => {
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId('score')).toHaveText('0');
  });

  test('Start button starts the game', async ({ page }) => {
    await page.getByTestId('start-button').click();
    await expect(page.getByTestId('game-canvas')).toHaveAttribute('data-state', 'running');
  });

  test('game progresses: either the score rises or the player gets hit', async ({ page }) => {
    const canvas = page.getByTestId('game-canvas');
    const score = page.getByTestId('score');
    await page.getByTestId('start-button').click();

    // Blocks spawn every 0.6 s and each one either hits the player or falls off
    // the screen (+1 score), so one of these must happen within a few seconds.
    await expect
      .poll(async () => (await canvas.getAttribute('data-state')) === 'over' || Number(await score.textContent()) > 0, {
        timeout: 10_000,
      })
      .toBe(true);
  });
});
