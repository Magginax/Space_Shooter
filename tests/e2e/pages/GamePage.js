import { expect } from '@playwright/test';

/** Page object for views/game.html: the handheld screen and the running game. */
export class GamePage {
  constructor(page) {
    this.page = page;
    this.playerBar = page.getByTestId('player-bar');
    this.playerName = page.getByTestId('player-name');
    this.guestNote = page.getByTestId('guest-note');
    this.canvas = page.getByTestId('game-canvas');
    this.startButton = page.getByTestId('start-game');
    this.abandonPrompt = page.getByTestId('abandon-prompt');
    this.backButton = page.getByTestId('upgrade-back');
  }

  // --- Actions ------------------------------------------------------------------

  async open() {
    await this.page.goto('/views/game.html');
  }

  async startGame() {
    await this.startButton.click();
  }

  /** Walk start -> bend -> level, then confirm. */
  async enterLevel() {
    await this.page.keyboard.press('ArrowRight');
    await this.page.keyboard.press('ArrowRight');
    await this.page.keyboard.press('Enter');
  }

  /** U during a run: the same prompt, and Yes opens the gun banners. */
  async abandonToUpgrades() {
    await this.page.keyboard.press('u');
    await expect(this.canvas).toHaveAttribute('data-state', 'paused');
    await expect(this.abandonPrompt).toBeVisible();
    await expect(this.abandonPrompt).toHaveAttribute('data-choice', 'no');
    await this.page.keyboard.press('ArrowRight');
    await this.page.keyboard.press('Enter');
  }

  async abandonRun() {
    await this.page.keyboard.press('m');
    await expect(this.canvas).toHaveAttribute('data-state', 'paused');
    await expect(this.abandonPrompt).toBeVisible();
    await expect(this.abandonPrompt).toHaveAttribute('data-choice', 'no');
    await this.page.keyboard.press('ArrowRight');
    await expect(this.abandonPrompt).toHaveAttribute('data-choice', 'yes');
    await this.page.keyboard.press('Enter');
  }

  async openUpgrades() {
    await this.page.keyboard.press('u');
  }

  async closeUpgrades() {
    await this.page.keyboard.press('Escape');
  }

  async clickBack() {
    await this.backButton.click();
  }

  async focusBeam() {
    await this.page.keyboard.press('ArrowRight');
    await expect(this.canvas).toHaveAttribute('data-gun', 'beam');
    await expect(this.canvas).toHaveAttribute('data-locked', '5');
  }

  async holdFire() {
    await this.page.keyboard.down('Space');
  }

  async releaseFire() {
    await this.page.keyboard.up('Space');
  }

  // --- Checks -------------------------------------------------------------------

  async expectOnGame() {
    await expect(this.page).toHaveURL(/\/views\/game\.html$/);
    await expect(this.playerBar).toBeVisible();
  }

  async expectPlayingAs(username, { guest = false } = {}) {
    await expect(this.playerBar).toBeVisible();
    await expect(this.playerName).toHaveText(username);
    if (guest) await expect(this.guestNote).toHaveText('(guest: scores are not saved)');
    else await expect(this.guestNote).toBeHidden();
  }

  async expectIdleGame() {
    await expect(this.canvas).toHaveAttribute('data-state', 'idle');
    await expect(this.canvas).toHaveAttribute('data-lives', '3');
    await expect(this.canvas).toHaveAttribute('data-score', '0');
    await expect(this.canvas).toHaveAttribute('data-level', '0');
    await expect(this.canvas).toHaveAttribute('data-xp', '0');
    await expect(this.canvas).toHaveAttribute('data-coins', '0');
    await expect(this.canvas).toHaveAttribute('data-gun', 'blaster');
    await expect(this.canvas).toHaveAttribute('data-locked', '');
    await expect(this.startButton).toBeVisible();
    await expect(this.backButton).toBeHidden();
  }

  async expectMap(node = 'start') {
    await expect(this.canvas).toHaveAttribute('data-state', 'map');
    await expect(this.canvas).toHaveAttribute('data-node', node);
    await expect(this.startButton).toBeHidden();
    await expect(this.abandonPrompt).toBeHidden();
  }

  async expectGameRunning() {
    await expect(this.canvas).toHaveAttribute('data-state', 'running');
    await expect(this.startButton).toBeHidden();
  }

  async expectUpgrades() {
    await expect(this.canvas).toHaveAttribute('data-state', 'upgrades');
    await expect(this.canvas).toHaveAttribute('data-gun', 'blaster');
    await expect(this.canvas).toHaveAttribute('data-locked', '');
    await expect(this.canvas).toHaveAttribute('data-level', '0');
    await expect(this.startButton).toBeHidden();
    await expect(this.abandonPrompt).toBeHidden();
    await expect(this.backButton).toBeVisible();
  }

  async expectScoreAbove(min) {
    await expect.poll(async () => Number(await this.canvas.getAttribute('data-score'))).toBeGreaterThan(min);
  }

  async expectXpAbove(min) {
    await expect.poll(async () => Number(await this.canvas.getAttribute('data-xp'))).toBeGreaterThan(min);
  }

  async expectCoinsAbove(min) {
    await expect.poll(async () => Number(await this.canvas.getAttribute('data-coins'))).toBeGreaterThan(min);
  }
}
