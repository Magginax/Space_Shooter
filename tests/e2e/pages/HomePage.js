import { expect } from '@playwright/test';

/** Page object for index.html: the site header and the game section (login gate). */
export class HomePage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.aboutHeading = page.getByRole('heading', { name: 'About' });
    this.gameSection = page.getByTestId('game-section');
    this.lock = page.getByTestId('game-lock');
    this.loginToPlayLink = page.getByTestId('login-to-play');
    this.gameArea = page.getByTestId('game-area');
    this.playerName = page.getByTestId('player-name');
    this.guestNote = page.getByTestId('guest-note');
  }

  // --- Actions ------------------------------------------------------------------

  async open() {
    await this.page.goto('/');
  }

  /** A direct link to the game, as someone would paste it. */
  async openGameLink() {
    await this.page.goto('/#game');
  }

  /** Clicks a link in the header navigation ("About", "Game", "Leaderboard", "Login"). */
  async clickNav(name) {
    await this.page.getByRole('link', { name }).click();
  }

  async clickLogInToPlay() {
    await this.loginToPlayLink.click();
  }

  // --- Checks -------------------------------------------------------------------

  async expectLoaded() {
    await expect(this.page).toHaveTitle('Space_Shooter');
    await expect(this.heading).toHaveText('Space_Shooter');
  }

  async expectScrolledToGame() {
    await expect(this.page).toHaveURL(/#game$/);
    await expect(this.gameSection).toBeInViewport();
  }

  /** The game is replaced by the "Log in to play" panel; About stays public. */
  async expectGameLocked() {
    await expect(this.gameSection).toHaveAttribute('data-access', 'locked');
    await expect(this.lock).toBeVisible();
    await expect(this.gameArea).toBeHidden();
    await expect(this.aboutHeading).toBeVisible();
  }

  async expectOnGame() {
    await expect(this.page).toHaveURL(/\/#game$/);
    await expect(this.gameSection).toHaveAttribute('data-access', 'granted');
  }

  async expectPlayingAs(username, { guest = false } = {}) {
    await expect(this.gameSection).toHaveAttribute('data-access', 'granted');
    await expect(this.playerName).toHaveText(username);
    if (guest) await expect(this.guestNote).toHaveText('(guest: scores are not saved)');
    else await expect(this.guestNote).toBeHidden();
  }
}
